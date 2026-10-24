import { randomUUID } from 'node:crypto';
import { AppError, FieldErrors, notFound } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { LIMITS } from '../lib/limits.js';
import { nowWib } from '../lib/time.js';

const rp = (n) => Number(n).toLocaleString('id-ID');

/**
 * Create discounts for a product. One row per variant, all sharing one batch_id.
 * Body (times are WIB 'YYYY-MM-DD HH:MM[:SS]'):
 *   { starts_at, ends_at, items: [{ variant_id, price }] }                 per-variant prices
 *   { starts_at, ends_at, variant_ids?: [id...], price }                    same price (default: all variants)
 *   { starts_at, ends_at, variant_ids?: [id...], percent }                  percent off each variant price
 */
export function createDiscounts(w, productId, body = {}) {
  const db = w.db;
  if (!db.stmt('SELECT 1 FROM products WHERE id = ? AND deleted_at IS NULL').get(productId)) throw notFound('product');
  const errs = new FieldErrors();
  const startsAt = v.datetime(errs, 'starts_at', body.starts_at, { required: true });
  const endsAt = v.datetime(errs, 'ends_at', body.ends_at, { required: true });
  if (startsAt && endsAt) {
    if (startsAt >= endsAt) errs.add('ends_at', 'discount_range');
    else if (endsAt <= nowWib()) errs.add('ends_at', 'discount_ended');
  }

  const variants = db.stmt('SELECT id, sku, price FROM product_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').all(productId);
  const byId = new Map(variants.map((x) => [x.id, x]));
  const rows = []; // { path, variant, price }

  if (Array.isArray(body.items)) {
    if (body.items.length === 0) errs.add('items', 'discount_no_variants');
    body.items.forEach((it, i) => {
      const vid = v.int(errs, `items[${i}].variant_id`, it?.variant_id, { required: true, min: 1 });
      const price = v.price(errs, `items[${i}].price`, it?.price, { required: true, max: LIMITS.maxPrice });
      if (vid && !byId.has(vid)) errs.add(`items[${i}].variant_id`, 'variant_not_in_product');
      if (vid && byId.has(vid)) rows.push({ path: `items[${i}].price`, variant: byId.get(vid), price });
    });
  } else {
    const hasPrice = body.price !== undefined && body.price !== null && body.price !== '';
    const hasPct = body.percent !== undefined && body.percent !== null && body.percent !== '';
    if (hasPrice === hasPct) errs.add('price', 'discount_price_or_percent');
    const price = hasPrice ? v.price(errs, 'price', body.price, { max: LIMITS.maxPrice }) : null;
    const pct = hasPct ? v.int(errs, 'percent', body.percent, { min: 1, max: 99 }) : null;
    let ids = variants.map((x) => x.id);
    if (body.variant_ids !== undefined && body.variant_ids !== null) {
      const list = v.list(errs, 'variant_ids', body.variant_ids) || [];
      ids = [];
      list.forEach((raw, i) => {
        const vid = v.int(errs, `variant_ids[${i}]`, raw, { required: true, min: 1 });
        if (vid && !byId.has(vid)) errs.add(`variant_ids[${i}]`, 'variant_not_in_product');
        else if (vid && !ids.includes(vid)) ids.push(vid);
      });
    }
    if (ids.length === 0 && !errs.has('variant_ids')) errs.add('variant_ids', 'discount_no_variants');
    const fieldPath = hasPct ? 'percent' : 'price';
    for (const vid of ids) {
      const variant = byId.get(vid);
      const p = pct !== null ? Math.round((variant.price * (100 - pct)) / 100) : price;
      rows.push({ path: fieldPath, variant, price: p });
    }
  }

  // Price rule + overlap rule (against stored discounts and inside this request).
  const seen = new Map();
  for (const r of rows) {
    if (r.price !== null && r.price < 1) {
      errs.add(r.path, 'discount_price_min', { price: rp(r.variant.price) });
    } else if (r.price !== null && r.price >= r.variant.price) {
      errs.add(r.path, 'discount_price_lower', { price: rp(r.variant.price) });
    }
    if (seen.has(r.variant.id)) errs.add(r.path, 'variant_combo_duplicate', { combo: r.variant.sku });
    seen.set(r.variant.id, true);
  }
  errs.throwIfAny();

  for (const r of rows) {
    const clash = db.stmt(
      `SELECT starts_at, ends_at FROM discounts WHERE variant_id = ? AND deleted_at IS NULL
          AND starts_at < ? AND ends_at > ? ORDER BY starts_at LIMIT 1`
    ).get(r.variant.id, endsAt, startsAt);
    if (clash) {
      const params = { range: { wibRange: [clash.starts_at, clash.ends_at] } };
      throw new AppError(409, 'DISCOUNT_OVERLAP', 'discount_overlap', params, {
        [r.path === 'price' || r.path === 'percent' ? `variant_${r.variant.id}` : r.path]: ['discount_overlap', params],
      });
    }
  }

  const batchId = randomUUID();
  const ids = db.transaction(() => rows.map((r) => w.insert('discounts', {
    variant_id: r.variant.id, price: r.price, starts_at: startsAt, ends_at: endsAt, batch_id: batchId,
  }, productId)))();
  const created = db.stmt(
    `SELECT id, variant_id, price, starts_at, ends_at, batch_id, created_at FROM discounts WHERE batch_id = ? ORDER BY id`
  ).all(batchId);
  return { batch_id: batchId, discounts: created.filter((d) => ids.includes(d.id)) };
}

/** Soft-delete one discount, or its whole batch with { batch: true }. */
export function deleteDiscount(w, id, { batch = false } = {}) {
  const db = w.db;
  const d = db.stmt(
    `SELECT d.*, pv.product_id FROM discounts d JOIN product_variants pv ON pv.id = d.variant_id
      WHERE d.id = ? AND d.deleted_at IS NULL`
  ).get(id);
  if (!d) throw notFound('discount');
  const targets = batch && d.batch_id
    ? db.stmt('SELECT * FROM discounts WHERE batch_id = ? AND deleted_at IS NULL').all(d.batch_id)
    : [db.stmt('SELECT * FROM discounts WHERE id = ?').get(id)];
  db.transaction(() => { for (const t of targets) w.softDelete('discounts', t.id, d.product_id, t); })();
  return { deleted: targets.map((t) => t.id) };
}
