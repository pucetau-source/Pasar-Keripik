import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError, FieldErrors, notFound } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { nowWib } from '../lib/time.js';
import { LIMITS } from '../lib/limits.js';
import { STOCK_REASON_LABELS, stockReasonLabel } from '../lib/i18n.js';

// Small in-process cache per db handle (settings are read on hot paths, e.g. default language).
const caches = new WeakMap();
const DERIVED = new Set(['stock_reason_options', 'stock_reason_labels', 'logo_url']);

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const LOGO_PX = 256;
const LOGO_FORMATS = new Set(['jpeg', 'png', 'webp']); // sniffed by sharp; SVG is never accepted

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

/** settings.low_stock_threshold as an integer (default 10). */
export function lowStockThreshold(db) {
  const n = Number(getSetting(db, 'low_stock_threshold'));
  return Number.isInteger(n) && n >= 0 ? n : 10;
}

/**
 * All settings. `stock_reasons` stays the stored list of values; alongside it:
 *   stock_reason_options: [{ value, label }]  (label in `lang`, for pickers)
 *   stock_reason_labels:  { value: { id, en } } (stored reasons + system reasons 'initial', 'sale')
 *   logo_url: '/uploads/<logo_file>' | null
 * `low_stock_threshold` is returned as an integer.
 */
export function allSettings(db, lang = 'id') {
  const out = {};
  for (const [k, val] of load(db)) {
    if (k === 'stock_reasons') {
      try { out[k] = JSON.parse(val); } catch { out[k] = []; }
    } else out[k] = val;
  }
  if ('low_stock_threshold' in out) out.low_stock_threshold = lowStockThreshold(db);
  out.logo_url = out.logo_file ? `/uploads/${out.logo_file}` : null;
  const reasons = Array.isArray(out.stock_reasons) ? out.stock_reasons : [];
  out.stock_reason_options = reasons.map((r) => ({ value: r, label: stockReasonLabel(r, lang) }));
  const labels = {};
  for (const r of [...reasons, ...Object.keys(STOCK_REASON_LABELS)]) {
    labels[r] = { id: stockReasonLabel(r, 'id'), en: stockReasonLabel(r, 'en') };
  }
  out.stock_reason_labels = labels;
  return out;
}

/** Writes setting rows (audited) inside the caller's transaction. */
function writeSettings(w, updates) {
  for (const { row, value } of updates) {
    if (row.value === value) continue;
    const now = nowWib();
    w.db.stmt('UPDATE settings SET value = ?, updated_by = ?, updated_at = ? WHERE key = ?').run(value, w.userId, now, row.key);
    w.log('settings', null, 'update', row, { ...row, value, updated_by: w.userId, updated_at: now });
  }
}

function settingRow(db, key) {
  return db.stmt('SELECT * FROM settings WHERE key = ? AND deleted_at IS NULL').get(key);
}

/** Removes an old logo file; never escapes uploadDir (names are server-generated anyway). */
function removeLogoFile(uploadDir, file) {
  if (!uploadDir || !file || path.basename(file) !== file) return;
  try { fs.rmSync(path.join(uploadDir, file), { force: true }); } catch { /* best effort */ }
}

/**
 * Update existing setting keys (unknown keys -> 404). Audited.
 * `logo_file` only accepts null/'' (= remove the logo) or its current value (no-op);
 * a new logo is uploaded through POST /settings/logo.
 */
export function updateSettings(w, body = {}, lang = 'id', { uploadDir = null } = {}) {
  const db = w.db;
  const errs = new FieldErrors();
  const updates = [];
  for (const [key, raw] of Object.entries(body)) {
    if (DERIVED.has(key)) continue; // read-only, computed by allSettings()
    const row = settingRow(db, key);
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
    } else if (key === 'low_stock_threshold') {
      const n = v.int(errs, key, raw, { required: true, min: 0, max: LIMITS.maxStock });
      value = n === null ? null : String(n);
    } else if (key === 'tagline') {
      value = v.str(errs, key, raw, { max: LIMITS.tagline });
    } else if (key === 'logo_file') {
      if (raw === null || raw === undefined || raw === '') value = null;
      else if (raw === row.value) value = row.value;
      else { errs.add(key, 'logo_use_upload'); value = row.value; }
    } else {
      value = v.str(errs, key, raw, { max: 500 });
    }
    updates.push({ row, value });
  }
  errs.throwIfAny();
  db.transaction(() => writeSettings(w, updates))();
  caches.delete(db);
  const cleared = updates.find((u) => u.row.key === 'logo_file' && u.row.value && u.value === null);
  if (cleared) removeLogoFile(uploadDir, cleared.row.value);
  return allSettings(db, lang);
}

/** POST /settings/logo: file = multer memory file (field `logo`). Re-encoded to WEBP, max 256 px. */
export async function uploadLogo(w, uploadDir, file, lang = 'id') {
  const db = w.db;
  if (!file) throw new AppError(422, 'VALIDATION', 'validation_failed', {}, { logo: ['image_required', {}] });
  let out;
  try {
    const img = sharp(file.buffer, { failOn: 'error', limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    if (!LOGO_FORMATS.has(meta.format)) {
      throw new AppError(415, 'IMAGE_TYPE', 'image_type', { file: file.originalname });
    }
    out = await img.rotate().resize(LOGO_PX, LOGO_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(422, 'IMAGE_UNREADABLE', 'image_unreadable', { file: file.originalname });
  }
  fs.mkdirSync(uploadDir, { recursive: true });
  const name = `logo-${randomUUID()}.webp`;
  fs.writeFileSync(path.join(uploadDir, name), out);
  let previous;
  try {
    db.transaction(() => {
      const row = settingRow(db, 'logo_file');
      if (!row) throw notFound('setting');
      previous = row.value;
      writeSettings(w, [{ row, value: name }]);
    })();
  } catch (e) {
    removeLogoFile(uploadDir, name);
    throw e;
  } finally {
    caches.delete(db);
  }
  if (previous && previous !== name) removeLogoFile(uploadDir, previous);
  return allSettings(db, lang);
}

/** DELETE /settings/logo: back to the default icon (file removed). Idempotent. */
export function deleteLogo(w, uploadDir, lang = 'id') {
  return updateSettings(w, { logo_file: null }, lang, { uploadDir });
}
