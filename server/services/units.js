import { AppError, FieldErrors, notFound, fieldError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { LIMITS } from '../lib/limits.js';

export function weightGrams(value, toBase) {
  if (value === null || value === undefined || toBase === null || toBase === undefined) return null;
  return Math.round(value * toBase * 1000) / 1000; // mg precision
}

export function getUnit(db, id) {
  return db.stmt('SELECT * FROM units WHERE id = ? AND deleted_at IS NULL').get(id);
}

export function listUnits(db) {
  return db.stmt(
    `SELECT u.id, u.name, u.symbol, u.to_base, u.position, u.created_at, u.updated_at,
            (SELECT COUNT(*) FROM product_variants pv WHERE pv.weight_unit_id = u.id AND pv.deleted_at IS NULL) AS used_count
       FROM units u WHERE u.deleted_at IS NULL ORDER BY u.position, u.id`
  ).all();
}

function readUnit(body, cur = {}) {
  const errs = new FieldErrors();
  const pick = (k) => (k in body ? body[k] : cur[k]);
  const out = {
    name: v.str(errs, 'name', pick('name'), { required: true, max: LIMITS.unitName }),
    symbol: v.str(errs, 'symbol', pick('symbol'), { required: true, max: LIMITS.unitSymbol }),
    to_base: v.num(errs, 'to_base', pick('to_base'), { required: true, positive: true }),
    position: v.int(errs, 'position', pick('position'), { min: 0, def: 0 }),
  };
  errs.throwIfAny();
  return out;
}

function assertFree(db, data, selfId = 0) {
  if (db.stmt('SELECT 1 FROM units WHERE symbol = ? COLLATE NOCASE AND deleted_at IS NULL AND id <> ?').get(data.symbol, selfId)) {
    throw fieldError('symbol', 'unit_symbol_taken', { symbol: data.symbol });
  }
  if (db.stmt('SELECT 1 FROM units WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL AND id <> ?').get(data.name, selfId)) {
    throw fieldError('name', 'unit_name_taken', { name: data.name });
  }
}

export function createUnit(w, body = {}) {
  const data = readUnit(body);
  assertFree(w.db, data);
  if (!('position' in body)) {
    data.position = w.db.stmt('SELECT COALESCE(MAX(position), 0) + 1 FROM units WHERE deleted_at IS NULL').pluck().get();
  }
  const id = w.db.transaction(() => w.insert('units', data))();
  return getUnit(w.db, id);
}

/** Updating to_base recomputes weight_grams of every variant using the unit (audited per variant). */
export function updateUnit(w, id, body = {}) {
  const db = w.db;
  const cur = getUnit(db, id);
  if (!cur) throw notFound('unit');
  const data = readUnit(body, cur);
  assertFree(db, data, id);
  db.transaction(() => {
    w.update('units', id, data, null, cur);
    if (data.to_base !== cur.to_base) {
      const variants = db.stmt('SELECT * FROM product_variants WHERE weight_unit_id = ? AND deleted_at IS NULL').all(id);
      for (const pv of variants) {
        w.update('product_variants', pv.id, { weight_grams: weightGrams(pv.weight_value, data.to_base) }, pv.product_id, pv);
      }
    }
  })();
  return getUnit(db, id);
}

export function deleteUnit(w, id) {
  const db = w.db;
  const cur = getUnit(db, id);
  if (!cur) throw notFound('unit');
  const used = db.stmt('SELECT COUNT(*) FROM product_variants WHERE weight_unit_id = ? AND deleted_at IS NULL').pluck().get(id);
  if (used) throw new AppError(409, 'UNIT_IN_USE', 'unit_in_use', { name: cur.name, count: used });
  db.transaction(() => w.softDelete('units', id, null, cur))();
}
