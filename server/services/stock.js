import { AppError, FieldErrors, notFound } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { LIMITS } from '../lib/limits.js';
import { stockReasonLabel } from '../lib/i18n.js';

function getVariant(db, id) {
  return db.stmt(
    `SELECT pv.id, pv.product_id, pv.sku, pv.stock, p.name AS product_name
       FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ? AND pv.deleted_at IS NULL AND p.deleted_at IS NULL`
  ).get(id);
}

/**
 * Admin stock change. Body: { qty_change } (+/-) OR { set_to } (final stock), plus reason, note?, ref?.
 * The DB triggers apply the movement to product_variants.stock and enforce stock >= 0.
 */
export function adjustStock(w, variantId, body = {}) {
  const db = w.db;
  const variant = getVariant(db, variantId);
  if (!variant) throw notFound('variant');
  const errs = new FieldErrors();
  const hasQty = body.qty_change !== undefined && body.qty_change !== null && body.qty_change !== '';
  const hasSet = body.set_to !== undefined && body.set_to !== null && body.set_to !== '';
  if (hasQty === hasSet) errs.add('qty_change', 'stock_qty_or_set');
  let qty = null;
  if (hasQty) {
    qty = v.int(errs, 'qty_change', body.qty_change, { min: -LIMITS.maxStock, max: LIMITS.maxStock });
    if (qty === 0) errs.add('qty_change', 'stock_zero');
  } else if (hasSet) {
    const target = v.int(errs, 'set_to', body.set_to, { min: 0, max: LIMITS.maxStock });
    if (target !== null) {
      qty = target - variant.stock;
      if (qty === 0) errs.add('set_to', 'stock_unchanged');
    }
  }
  const reason = v.str(errs, 'reason', body.reason, { required: true, max: LIMITS.stockReason });
  const note = v.str(errs, 'note', body.note, { max: LIMITS.note });
  const ref = v.str(errs, 'ref', body.ref, { max: 100 });
  errs.throwIfAny();
  if (qty !== null && variant.stock + qty < 0) {
    throw new AppError(409, 'STOCK_NEGATIVE', 'stock_negative', {}, { qty_change: ['stock_negative', {}] });
  }
  const id = db.transaction(() => w.insert('stock_movements', {
    variant_id: variantId, qty_change: qty, reason, source: 'admin', ref, note,
  }, variant.product_id))();
  return {
    movement: db.stmt('SELECT * FROM stock_movements WHERE id = ?').get(id),
    stock: db.stmt('SELECT stock FROM product_variants WHERE id = ?').pluck().get(variantId),
  };
}

export function listMovements(db, variantId, query = {}, lang = 'id') {
  const variant = getVariant(db, variantId);
  if (!variant) throw notFound('variant');
  const errs = new FieldErrors();
  const page = v.int(errs, 'page', query.page, { min: 1, def: 1 });
  const pageSize = v.int(errs, 'page_size', query.page_size, { min: 1, max: LIMITS.pageSizeMax, def: LIMITS.pageSizeDefault });
  errs.throwIfAny();
  const total = db.stmt('SELECT COUNT(*) FROM stock_movements WHERE variant_id = ?').pluck().get(variantId);
  const items = db.stmt(
    `SELECT m.id, m.qty_change, m.stock_after, m.reason, m.source, m.ref, m.note, m.created_at,
            u.id AS user_id, u.userid AS user_userid, u.name AS user_name
       FROM (SELECT sm.*, SUM(sm.qty_change) OVER (ORDER BY sm.id) AS stock_after
               FROM stock_movements sm WHERE sm.variant_id = ?) m
       LEFT JOIN users u ON u.id = m.created_by
      ORDER BY m.id DESC LIMIT ? OFFSET ?`
  ).all(variantId, pageSize, (page - 1) * pageSize).map(({ user_id, user_userid, user_name, ...m }) => ({
    ...m, reason_label: stockReasonLabel(m.reason, lang), created_by: user_id ? { id: user_id, userid: user_userid, name: user_name } : null,
  }));
  return { variant, items, total, page, page_size: pageSize };
}
