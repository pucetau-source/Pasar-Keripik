import { FieldErrors, notFound } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { nowWib } from '../lib/time.js';
import { LIMITS } from '../lib/limits.js';
import { STOCK_REASON_LABELS, stockReasonLabel } from '../lib/i18n.js';

// Small in-process cache per db handle (settings are read on hot paths, e.g. default language).
const caches = new WeakMap();
const DERIVED = new Set(['stock_reason_options', 'stock_reason_labels']);

function load(db) {
  let c = caches.get(db);
  if (!c) {
    c = new Map(db.prepare('SELECT key, value FROM settings WHERE deleted_at IS NULL').all().map((r) => [r.key, r.value]));
    caches.set(db, c);
  }
  return c;
}

export function getSetting(db, key) {
  return load(db).get(key) ?? null;
}

/**
 * All settings. `stock_reasons` stays the stored list of values; alongside it:
 *   stock_reason_options: [{ value, label }]  (label in `lang`, for pickers)
 *   stock_reason_labels:  { value: { id, en } } (stored reasons + system reasons 'initial', 'sale')
 */
export function allSettings(db, lang = 'id') {
  const out = {};
  for (const [k, val] of load(db)) {
    if (k === 'stock_reasons') {
      try { out[k] = JSON.parse(val); } catch { out[k] = []; }
    } else out[k] = val;
  }
  const reasons = Array.isArray(out.stock_reasons) ? out.stock_reasons : [];
  out.stock_reason_options = reasons.map((r) => ({ value: r, label: stockReasonLabel(r, lang) }));
  const labels = {};
  for (const r of [...reasons, ...Object.keys(STOCK_REASON_LABELS)]) {
    labels[r] = { id: stockReasonLabel(r, 'id'), en: stockReasonLabel(r, 'en') };
  }
  out.stock_reason_labels = labels;
  return out;
}

/** Update existing setting keys (unknown keys -> 404). Audited. */
export function updateSettings(w, body = {}, lang = 'id') {
  const db = w.db;
  const errs = new FieldErrors();
  const updates = [];
  for (const [key, raw] of Object.entries(body)) {
    if (DERIVED.has(key)) continue; // read-only, computed by allSettings()
    const row = db.stmt('SELECT * FROM settings WHERE key = ? AND deleted_at IS NULL').get(key);
    if (!row) throw notFound('setting');
    let value;
    if (key === 'stock_reasons') {
      const list = v.list(errs, key, raw, { required: true, max: 50 });
      value = list ? JSON.stringify(list.map((s, i) => v.str(errs, `${key}[${i}]`, s, { required: true, max: LIMITS.stockReason }))) : null;
    } else if (key === 'default_language') {
      value = v.oneOf(errs, key, raw, ['id', 'en'], { required: true });
    } else if (key === 'max_images_per_product') {
      const n = v.int(errs, key, raw, { required: true, min: 1, max: 50 });
      value = n === null ? null : String(n);
    } else {
      value = v.str(errs, key, raw, { max: 500 });
    }
    updates.push({ row, value });
  }
  errs.throwIfAny();
  db.transaction(() => {
    for (const { row, value } of updates) {
      if (row.value === value) continue;
      const now = nowWib();
      db.stmt('UPDATE settings SET value = ?, updated_by = ?, updated_at = ? WHERE key = ?').run(value, w.userId, now, row.key);
      w.log('settings', null, 'update', row, { ...row, value, updated_by: w.userId, updated_at: now });
    }
  })();
  caches.delete(db);
  return allSettings(db, lang);
}
