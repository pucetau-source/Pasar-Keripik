// Small validation helpers that record bilingual field errors into a FieldErrors bag.
import { normalizeWib } from './time.js';
import { LIMITS } from './limits.js';

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function str(errs, path, val, { required = false, max = 255, def = null } = {}) {
  if (isBlank(val)) {
    if (required) errs.add(path, 'required');
    return def;
  }
  if (typeof val !== 'string' && typeof val !== 'number') { errs.add(path, 'must_be_text'); return def; }
  const s = String(val).trim();
  if (s.length > max) { errs.add(path, 'too_long', { max }); return def; }
  return s;
}

export function int(errs, path, val, { required = false, min = null, max = null, def = null } = {}) {
  if (isBlank(val)) {
    if (required) errs.add(path, 'required');
    return def;
  }
  const n = typeof val === 'string' ? Number(val.trim()) : val;
  if (typeof n !== 'number' || !Number.isInteger(n)) { errs.add(path, 'must_be_int'); return def; }
  if (min !== null && n < min) { errs.add(path, 'min_value', { min }); return def; }
  if (max !== null && n > max) { errs.add(path, 'max_value', { max }); return def; }
  return n;
}

/** Whole-Rupiah price: integer >= 1 (0 is rejected with a friendly 'price_min' message). */
export function price(errs, path, val, { required = false, max = null, def = null } = {}) {
  const n = int(errs, path, val, { required, max, def });
  if (n !== null && n < LIMITS.minPrice) { errs.add(path, 'price_min'); return def; }
  return n;
}

export function num(errs, path, val, { required = false, positive = false, min = null, max = null, def = null } = {}) {
  if (isBlank(val)) {
    if (required) errs.add(path, 'required');
    return def;
  }
  const n = typeof val === 'string' ? Number(val.trim().replace(',', '.')) : val;
  if (typeof n !== 'number' || !Number.isFinite(n)) { errs.add(path, 'must_be_number'); return def; }
  if (positive && n <= 0) { errs.add(path, 'must_be_positive'); return def; }
  if (min !== null && n < min) { errs.add(path, 'min_value', { min }); return def; }
  if (max !== null && n > max) { errs.add(path, 'max_value', { max }); return def; }
  return n;
}

export function bool(errs, path, val, { def = false } = {}) {
  if (val === undefined || val === null) return def;
  if (val === true || val === 1 || val === '1' || val === 'true') return true;
  if (val === false || val === 0 || val === '0' || val === 'false') return false;
  errs.add(path, 'must_be_bool');
  return def;
}

export function oneOf(errs, path, val, values, { required = false, def = null } = {}) {
  if (isBlank(val)) {
    if (required) errs.add(path, 'required');
    return def;
  }
  if (!values.includes(val)) { errs.add(path, 'one_of', { values: values.join(', ') }); return def; }
  return val;
}

export function datetime(errs, path, val, { required = false } = {}) {
  if (isBlank(val)) {
    if (required) errs.add(path, 'required');
    return null;
  }
  const s = normalizeWib(val);
  if (!s) errs.add(path, 'datetime_format');
  return s;
}

export function list(errs, path, val, { required = false, max = null } = {}) {
  if (val === undefined || val === null) {
    if (required) errs.add(path, 'required');
    return null;
  }
  if (!Array.isArray(val)) { errs.add(path, 'must_be_list'); return null; }
  if (max !== null && val.length > max) { errs.add(path, 'too_many', { max }); return null; }
  return val;
}

/** Parse a positive integer route/query id. Returns null when invalid. */
export function idParam(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
