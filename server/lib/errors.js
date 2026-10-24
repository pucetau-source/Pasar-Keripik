import { t } from './i18n.js';

/**
 * Application error. `key` is an i18n key, `fields` maps field path -> [key, params].
 * Translated into {error:{code,message,fields}} by the error handler.
 */
export class AppError extends Error {
  constructor(status, code, key = code, params = {}, fields = null) {
    super(key);
    this.status = status;
    this.code = code;
    this.key = key;
    this.params = params;
    this.fields = fields;
  }
}

export const notFound = (entity) => new AppError(404, 'NOT_FOUND', 'not_found', { entity });
export const conflict = (key, params) => new AppError(409, key.toUpperCase(), key, params);

/** Collects field errors; throw with .throwIfAny(). */
export class FieldErrors {
  constructor() { this.map = {}; }
  add(path, key, params = {}) {
    if (!this.map[path]) this.map[path] = [key, params];
    return this;
  }
  has(path) { return path in this.map; }
  get any() { return Object.keys(this.map).length > 0; }
  throwIfAny() {
    if (this.any) throw new AppError(422, 'VALIDATION', 'validation_failed', {}, this.map);
  }
}

export function fieldError(path, key, params = {}) {
  return new AppError(422, 'VALIDATION', 'validation_failed', {}, { [path]: [key, params] });
}

// SQLite trigger RAISE(ABORT,'X') messages -> API errors (safety net behind app validation).
const TRIGGER_MAP = {
  STOCK_NEGATIVE: [409, 'stock_negative'],
  STOCK_SOURCE_RULE: [403, 'stock_source_rule'],
  STOCK_ZERO: [422, 'stock_zero'],
  STOCK_DIRECT_UPDATE: [409, 'stock_direct_update'],
  STOCK_INITIAL_NONZERO: [409, 'stock_direct_update'],
  STOCK_VARIANT_MISSING: [404, 'not_found', { entity: 'variant' }],
  DISCOUNT_OVERLAP: [409, 'discount_overlap_any'],
  DISCOUNT_RANGE: [422, 'discount_range'],
  DISCOUNT_PRICE: [422, 'discount_price_lower', { price: '?' }],
  HARD_DELETE_FORBIDDEN: [405, 'hard_delete_forbidden'],
};

export function fromSqliteError(err) {
  if (!err || typeof err.code !== 'string' || !err.code.startsWith('SQLITE')) return null;
  const msg = String(err.message || '');
  for (const [k, [status, key, params]] of Object.entries(TRIGGER_MAP)) {
    if (msg.includes(k)) return new AppError(status, k, key, params || {});
  }
  if (err.code === 'SQLITE_CONSTRAINT_CHECK' && msg.includes('stock')) {
    return new AppError(409, 'STOCK_NEGATIVE', 'stock_negative');
  }
  return null;
}

export function toResponse(err, lang) {
  const body = { error: { code: err.code, message: t(lang, err.key, err.params) } };
  if (err.fields) {
    body.error.fields = {};
    for (const [path, [key, params]] of Object.entries(err.fields)) {
      body.error.fields[path] = t(lang, key, params);
    }
  }
  return body;
}
