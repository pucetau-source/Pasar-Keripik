import { AppError, FieldErrors, notFound } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { LIMITS } from '../lib/limits.js';
import { nowWib } from '../lib/time.js';
import { getCategory, descendantIds, categoryPath } from './categories.js';
import { weightGrams } from './units.js';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { absPath, categoryFolder, joinRel, moveProductImages, withFileOps } from './folders.js';
import { getSetting, lowStockThreshold } from './settings.js';
import { imageUrls } from './images.js';

const lc = (s) => String(s).toLowerCase();
const ALIVE_PRODUCT = 'SELECT * FROM products WHERE id = ? AND deleted_at IS NULL';

export function getProductRow(db, id) {
  return db.stmt(ALIVE_PRODUCT).get(id);
}

// ---------------------------------------------------------------------------
// Validation

/** Validates wholesale tiers for one variant. Returns normalized tiers sorted by min_qty. */
export function validateWholesale(errs, base, tiers, variantPrice, minPurchase = 1) {
  const list = v.list(errs, base, tiers ?? [], { max: LIMITS.maxWholesaleTiers }) || [];
  const minQty = Math.max(LIMITS.wholesaleMinQty, (minPurchase || 1) + 1);
  const out = [];
  list.forEach((t, j) => {
    const p = `${base}[${j}]`;
    const qty = v.int(errs, `${p}.min_qty`, t?.min_qty, { required: true, min: minQty, max: LIMITS.maxStock });
    const price = v.price(errs, `${p}.price`, t?.price, { required: true, max: LIMITS.maxPrice });
    if (qty === null && errs.has(`${p}.min_qty`) && t?.min_qty !== undefined && Number.isInteger(Number(t.min_qty))) {
      // replace generic min message with the wholesale-specific one
      errs.map[`${p}.min_qty`] = ['wholesale_min_qty', { min: minQty }];
    }
    out.push({ idx: j, min_qty: qty, price });
  });
  // Rules are checked in the order given (the UI lists tiers top-down by quantity).
  let prev = null;
  for (const t of out) {
    const p = `${base}[${t.idx}]`;
    if (t.price !== null && variantPrice !== null && t.price >= variantPrice) {
      errs.add(`${p}.price`, 'wholesale_price_lower', { price: variantPrice.toLocaleString('id-ID') });
    }
    if (prev && t.min_qty !== null && prev.min_qty !== null && t.min_qty <= prev.min_qty) {
      errs.add(`${p}.min_qty`, 'wholesale_qty_increasing');
    }
    if (prev && t.price !== null && prev.price !== null && t.price >= prev.price) {
      errs.add(`${p}.price`, 'wholesale_price_decreasing');
    }
    prev = t;
  }
  return out.map(({ min_qty, price }) => ({ min_qty, price }));
}

function readScalars(db, errs, body, cur) {
  const has = (k) => !cur || k in body;
  const pick = (k) => (k in body ? body[k] : cur ? cur[k] : undefined);
  const out = {};
  if (has('name')) out.name = v.str(errs, 'name', body.name, { required: true, max: LIMITS.productName });
  if (has('description')) out.description = v.str(errs, 'description', body.description, { max: LIMITS.description });
  if (has('category_id')) {
    const cid = v.int(errs, 'category_id', body.category_id, { required: true, min: 1 });
    if (cid && !getCategory(db, cid)) errs.add('category_id', 'category_not_found');
    out.category_id = cid;
  }
  if (has('condition')) out.condition = v.oneOf(errs, 'condition', body.condition, ['new', 'used'], { def: 'new' });
  if (has('status')) out.status = v.oneOf(errs, 'status', body.status, ['active', 'inactive'], { def: 'active' });
  if (has('min_purchase')) out.min_purchase = v.int(errs, 'min_purchase', body.min_purchase, { min: 1, max: LIMITS.maxStock, def: 1 });
  if (has('preorder') || has('preorder_days')) {
    const pre = v.bool(errs, 'preorder', pick('preorder'), { def: false });
    out.preorder = pre ? 1 : 0;
    if (pre) {
      const days = pick('preorder_days');
      if (days === undefined || days === null || days === '') errs.add('preorder_days', 'preorder_days_required');
      else out.preorder_days = v.int(errs, 'preorder_days', days, { min: LIMITS.preorderDaysMin, max: LIMITS.preorderDaysMax });
    } else {
      out.preorder_days = null;
    }
  }
  for (const k of ['length_cm', 'width_cm', 'height_cm']) {
    if (has(k)) out[k] = v.num(errs, k, body[k], { positive: true, max: 100000 });
  }
  return out;
}

function readTags(errs, raw) {
  const list = v.list(errs, 'tags', raw ?? [], { max: LIMITS.maxTags }) || [];
  const seen = new Set();
  const tags = [];
  list.forEach((t, i) => {
    const s = v.str(errs, `tags[${i}]`, t, { required: true, max: LIMITS.tagLength });
    if (!s) return;
    const norm = s.replace(/\s+/g, ' ');
    if (seen.has(lc(norm))) return; // silently de-duplicate
    seen.add(lc(norm));
    tags.push(norm);
  });
  return tags;
}

/** Validates axes + variants. Pure (no writes). */
function readStructure(db, errs, body, { productId = 0, minPurchase = 1 }) {
  const axesIn = v.list(errs, 'axes', body.axes ?? [], { max: LIMITS.maxAxes });
  if (axesIn === null && errs.has('axes') && Array.isArray(body.axes)) {
    errs.map.axes = ['axes_max', { max: LIMITS.maxAxes }];
  }
  const axes = [];
  const axisNames = new Set();
  (axesIn || []).forEach((a, i) => {
    const name = v.str(errs, `axes[${i}].name`, a?.name, { required: true, max: LIMITS.axisName });
    if (name) {
      if (axisNames.has(lc(name))) errs.add(`axes[${i}].name`, 'axis_name_duplicate', { name });
      axisNames.add(lc(name));
    }
    const optsIn = v.list(errs, `axes[${i}].options`, a?.options, { required: true, max: LIMITS.maxOptionsPerAxis });
    if (optsIn && optsIn.length === 0) errs.add(`axes[${i}].options`, 'options_required');
    const seen = new Set();
    const options = [];
    (optsIn || []).forEach((o, j) => {
      const isObj = o && typeof o === 'object';
      const value = v.str(errs, `axes[${i}].options[${j}]`, isObj ? o.value : o, { required: true, max: LIMITS.optionValue });
      if (!value) return;
      if (seen.has(lc(value))) { errs.add(`axes[${i}].options[${j}]`, 'option_duplicate', { value }); return; }
      seen.add(lc(value));
      options.push({ id: isObj && Number.isInteger(o.id) ? o.id : null, value });
    });
    axes.push({ id: a && Number.isInteger(a.id) ? a.id : null, name, options });
  });

  const varsIn = v.list(errs, 'variants', body.variants, { required: true, max: LIMITS.maxVariants }) || [];
  if (Array.isArray(body.variants) && body.variants.length === 0) errs.add('variants', 'variants_required');
  if (axes.length === 0 && varsIn.length > 1) errs.add('variants', 'single_variant_only');

  const units = new Map(db.stmt('SELECT id, to_base FROM units WHERE deleted_at IS NULL').all().map((u) => [u.id, u.to_base]));
  const combos = new Set();
  const skus = new Map();
  const barcodes = new Map();
  const variants = varsIn.map((x, i) => {
    const p = `variants[${i}]`;
    x = x && typeof x === 'object' ? x : {};
    const values = Array.isArray(x.option_values) ? x.option_values : [];
    const optionIdx = [];
    if (values.length !== axes.length) {
      errs.add(`${p}.option_values`, 'variant_options_count', { count: axes.length });
    } else {
      values.forEach((val, k) => {
        const idx = axes[k].options.findIndex((o) => lc(o.value) === lc(String(val ?? '').trim()));
        if (idx < 0) errs.add(`${p}.option_values`, 'variant_option_unknown', { value: val, axis: axes[k].name });
        optionIdx.push(idx);
      });
      const key = optionIdx.join('|');
      if (axes.length && !optionIdx.includes(-1)) {
        if (combos.has(key)) errs.add(`${p}.option_values`, 'variant_combo_duplicate', { combo: values.join(' / ') });
        combos.add(key);
      }
    }
    const sku = v.str(errs, `${p}.sku`, x.sku, { max: LIMITS.sku });
    if (sku) {
      if (skus.has(lc(sku))) errs.add(`${p}.sku`, 'sku_duplicate', { sku });
      skus.set(lc(sku), i);
    }
    const barcode = v.str(errs, `${p}.barcode`, x.barcode, { max: LIMITS.barcode });
    if (barcode) {
      if (barcodes.has(barcode)) errs.add(`${p}.barcode`, 'barcode_duplicate', { barcode });
      barcodes.set(barcode, i);
    }
    const price = v.price(errs, `${p}.price`, x.price, { required: true, max: LIMITS.maxPrice });
    const stock = v.int(errs, `${p}.stock`, x.stock, { min: 0, max: LIMITS.maxStock, def: 0 });
    const weightValue = v.num(errs, `${p}.weight_value`, x.weight_value, { required: true, positive: true, max: 1e9 });
    const unitId = v.int(errs, `${p}.weight_unit_id`, x.weight_unit_id, { required: true, min: 1 });
    if (unitId && !units.has(unitId)) errs.add(`${p}.weight_unit_id`, 'unit_not_found');
    const active = v.bool(errs, `${p}.active`, x.active, { def: true });
    const wholesale = validateWholesale(errs, `${p}.wholesale`, x.wholesale, price, minPurchase);
    return {
      idx: i, id: Number.isInteger(x.id) ? x.id : null, optionIdx, sku, barcode, price, stock,
      weight_value: weightValue, weight_unit_id: unitId,
      weight_grams: weightGrams(weightValue, units.get(unitId)), active: active ? 1 : 0, wholesale,
    };
  });

  // Global uniqueness (other products).
  for (const vr of variants) {
    if (vr.sku && db.stmt(
      'SELECT 1 FROM product_variants WHERE sku = ? COLLATE NOCASE AND deleted_at IS NULL AND product_id <> ?'
    ).get(vr.sku, productId)) errs.add(`variants[${vr.idx}].sku`, 'sku_taken', { sku: vr.sku });
    if (vr.barcode && db.stmt(
      'SELECT 1 FROM product_variants WHERE barcode = ? AND deleted_at IS NULL AND product_id <> ?'
    ).get(vr.barcode, productId)) errs.add(`variants[${vr.idx}].barcode`, 'barcode_taken', { barcode: vr.barcode });
  }
  return { axes, variants };
}

// ---------------------------------------------------------------------------
// Writes

function syncTags(w, productId, tags) {
  const db = w.db;
  const existing = db.stmt('SELECT * FROM product_tags WHERE product_id = ? AND deleted_at IS NULL').all(productId);
  const want = new Map(tags.map((t) => [lc(t), t]));
  for (const row of existing) {
    if (!want.has(lc(row.tag))) w.softDelete('product_tags', row.id, productId, row);
    else {
      if (row.tag !== want.get(lc(row.tag))) w.update('product_tags', row.id, { tag: want.get(lc(row.tag)) }, productId, row);
      want.delete(lc(row.tag));
    }
  }
  for (const tag of want.values()) w.insert('product_tags', { product_id: productId, tag }, productId);
}

function softDeleteVariant(w, productId, row) {
  const db = w.db;
  for (const t of db.stmt('SELECT * FROM wholesale_tiers WHERE variant_id = ? AND deleted_at IS NULL').all(row.id)) {
    w.softDelete('wholesale_tiers', t.id, productId, t);
  }
  for (const d of db.stmt('SELECT * FROM discounts WHERE variant_id = ? AND deleted_at IS NULL').all(row.id)) {
    w.softDelete('discounts', d.id, productId, d);
  }
  for (const vo of db.stmt('SELECT * FROM variant_options WHERE variant_id = ? AND deleted_at IS NULL').all(row.id)) {
    w.softDelete('variant_options', vo.id, productId, vo);
  }
  w.softDelete('product_variants', row.id, productId, row);
}

function syncTiers(w, productId, variantId, tiers) {
  const db = w.db;
  const existing = db.stmt('SELECT * FROM wholesale_tiers WHERE variant_id = ? AND deleted_at IS NULL ORDER BY min_qty').all(variantId);
  const byQty = new Map(tiers.map((t) => [t.min_qty, t]));
  for (const row of existing) {
    const want = byQty.get(row.min_qty);
    if (!want) w.softDelete('wholesale_tiers', row.id, productId, row);
    else {
      w.update('wholesale_tiers', row.id, { price: want.price }, productId, row);
      byQty.delete(row.min_qty);
    }
  }
  for (const t of byQty.values()) w.insert('wholesale_tiers', { variant_id: variantId, min_qty: t.min_qty, price: t.price }, productId);
}

function autoSku(db, productId, taken) {
  const prefix = getSetting(db, 'sku_prefix') || 'SKU';
  for (let n = 1; ; n++) {
    const sku = `${prefix}${productId}-${n}`;
    if (taken.has(lc(sku))) continue;
    if (db.stmt('SELECT 1 FROM product_variants WHERE sku = ? COLLATE NOCASE AND deleted_at IS NULL').get(sku)) continue;
    taken.add(lc(sku));
    return sku;
  }
}

/** Applies axes/options/variants/tiers to a product (create or full replace). */
function syncStructure(w, productId, { axes, variants }, errsForPrice) {
  const db = w.db;
  const now = nowWib();

  // 1. Axes + options (match by id, else by name/value case-insensitively).
  const curAxes = db.stmt('SELECT * FROM product_axes WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').all(productId);
  const usedAxis = new Set();
  const optionIds = []; // [axisIdx][optIdx] -> option id
  axes.forEach((a, i) => {
    let row = (a.id && curAxes.find((r) => r.id === a.id && !usedAxis.has(r.id)))
      || curAxes.find((r) => !usedAxis.has(r.id) && lc(r.name) === lc(a.name));
    let axisId;
    if (row) {
      usedAxis.add(row.id);
      axisId = row.id;
      w.update('product_axes', axisId, { name: a.name, position: i }, productId, row);
    } else {
      axisId = w.insert('product_axes', { product_id: productId, name: a.name, position: i }, productId);
      usedAxis.add(axisId);
    }
    const curOpts = row
      ? db.stmt('SELECT * FROM axis_options WHERE axis_id = ? AND deleted_at IS NULL ORDER BY position, id').all(axisId)
      : [];
    const usedOpt = new Set();
    optionIds[i] = a.options.map((o, j) => {
      const orow = (o.id && curOpts.find((r) => r.id === o.id && !usedOpt.has(r.id)))
        || curOpts.find((r) => !usedOpt.has(r.id) && lc(r.value) === lc(o.value));
      if (orow) {
        usedOpt.add(orow.id);
        w.update('axis_options', orow.id, { value: o.value, position: j }, productId, orow);
        return orow.id;
      }
      const oid = w.insert('axis_options', { axis_id: axisId, value: o.value, position: j }, productId);
      usedOpt.add(oid);
      return oid;
    });
    for (const r of curOpts) if (!usedOpt.has(r.id)) w.softDelete('axis_options', r.id, productId, r);
  });
  for (const r of curAxes) {
    if (usedAxis.has(r.id)) continue;
    for (const o of db.stmt('SELECT * FROM axis_options WHERE axis_id = ? AND deleted_at IS NULL').all(r.id)) {
      w.softDelete('axis_options', o.id, productId, o);
    }
    w.softDelete('product_axes', r.id, productId, r);
  }

  // 2. Match variants: by id, else by identical option set.
  const curVars = db.stmt('SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').all(productId);
  const links = db.stmt(
    `SELECT vo.variant_id, vo.option_id FROM variant_options vo
       JOIN product_variants pv ON pv.id = vo.variant_id
      WHERE pv.product_id = ? AND pv.deleted_at IS NULL AND vo.deleted_at IS NULL`
  ).all(productId);
  const curKey = new Map(curVars.map((r) => [r.id, []]));
  for (const l of links) curKey.get(l.variant_id)?.push(l.option_id);
  const keyOf = (ids) => [...ids].sort((a, b) => a - b).join(',');
  const usedVar = new Set();
  const plan = variants.map((vr) => {
    const want = vr.optionIdx.map((oi, k) => optionIds[k][oi]);
    let row = vr.id ? curVars.find((r) => r.id === vr.id && !usedVar.has(r.id)) : null;
    if (vr.id && !row) {
      throw new AppError(422, 'VALIDATION', 'validation_failed', {}, { [`variants[${vr.idx}].id`]: ['variant_not_in_product', {}] });
    }
    if (!row) row = curVars.find((r) => !usedVar.has(r.id) && keyOf(curKey.get(r.id)) === keyOf(want));
    if (row) usedVar.add(row.id);
    return { vr, row, want };
  });

  // 3. Price changes must stay above active/scheduled discounts.
  for (const { vr, row } of plan) {
    if (!row || vr.price === row.price) continue;
    const d = db.stmt(
      `SELECT MAX(price) FROM discounts WHERE variant_id = ? AND deleted_at IS NULL AND ends_at > ?`
    ).pluck().get(row.id, now);
    if (d !== null && d >= vr.price) errsForPrice.add(`variants[${vr.idx}].price`, 'discount_price_conflict', { price: d.toLocaleString('id-ID') });
  }
  errsForPrice.throwIfAny();

  // 4. Remove variants that are no longer present (first, so their SKU/barcode free up).
  for (const r of curVars) if (!usedVar.has(r.id)) softDeleteVariant(w, productId, r);

  // 5. Update / insert.
  const takenSkus = new Set(variants.filter((x) => x.sku).map((x) => lc(x.sku)));
  plan.forEach(({ vr, row, want }, pos) => {
    const fields = {
      barcode: vr.barcode, price: vr.price, weight_value: vr.weight_value, weight_unit_id: vr.weight_unit_id,
      weight_grams: vr.weight_grams, active: vr.active, position: pos,
    };
    let variantId;
    if (row) {
      variantId = row.id;
      w.update('product_variants', variantId, { ...fields, sku: vr.sku || row.sku }, productId, row);
      const have = curKey.get(variantId);
      if (keyOf(have) !== keyOf(want)) {
        for (const vo of db.stmt('SELECT * FROM variant_options WHERE variant_id = ? AND deleted_at IS NULL').all(variantId)) {
          if (!want.includes(vo.option_id)) w.softDelete('variant_options', vo.id, productId, vo);
        }
        for (const oid of want) if (!have.includes(oid)) w.insert('variant_options', { variant_id: variantId, option_id: oid }, productId);
      }
    } else {
      variantId = w.insert('product_variants', {
        product_id: productId, sku: vr.sku || autoSku(db, productId, takenSkus), ...fields, stock: 0,
      }, productId);
      for (const oid of want) w.insert('variant_options', { variant_id: variantId, option_id: oid }, productId);
      if (vr.stock > 0) {
        w.insert('stock_movements', {
          variant_id: variantId, qty_change: vr.stock, reason: 'initial', source: 'admin', note: null, ref: null,
        }, productId);
      }
    }
    syncTiers(w, productId, variantId, vr.wholesale);
  });
}

export function createProduct(w, body = {}) {
  const db = w.db;
  const errs = new FieldErrors();
  const data = readScalars(db, errs, body, null);
  const tags = readTags(errs, body.tags);
  const structure = readStructure(db, errs, body, { minPurchase: data.min_purchase || 1 });
  errs.throwIfAny();
  const id = db.transaction(() => {
    const pid = w.insert('products', data);
    syncTags(w, pid, tags);
    syncStructure(w, pid, structure, new FieldErrors());
    return pid;
  })();
  return getProductDetail(db, id);
}

/**
 * Changing category_id moves the product's image files (+ thumbs, also of removed photos) into the
 * new category's folder in the same transaction (rolled back if a file cannot be moved).
 */
export function updateProduct(w, id, body = {}, { uploadDir = null } = {}) {
  const db = w.db;
  const cur = getProductRow(db, id);
  if (!cur) throw notFound('product');
  const errs = new FieldErrors();
  const data = readScalars(db, errs, body, cur);
  const tags = 'tags' in body ? readTags(errs, body.tags) : null;
  const hasAxes = 'axes' in body;
  const hasVariants = 'variants' in body;
  let structure = null;
  if (hasAxes !== hasVariants) errs.add(hasAxes ? 'variants' : 'axes', 'axes_variants_together');
  else if (hasVariants) {
    structure = readStructure(db, errs, body, { productId: id, minPurchase: data.min_purchase ?? cur.min_purchase });
  } else if ('min_purchase' in body && data.min_purchase) {
    // wholesale tiers must stay above the minimum purchase
    const low = db.stmt(
      `SELECT MIN(t.min_qty) FROM wholesale_tiers t JOIN product_variants pv ON pv.id = t.variant_id
        WHERE pv.product_id = ? AND pv.deleted_at IS NULL AND t.deleted_at IS NULL`
    ).pluck().get(id);
    if (low !== null && low <= data.min_purchase) errs.add('min_purchase', 'max_value', { max: low - 1 });
  }
  errs.throwIfAny();
  const recategorised = data.category_id !== undefined && data.category_id !== cur.category_id;
  withFileOps(db, uploadDir, (ops) => {
    w.update('products', id, data, id, cur);
    if (tags) syncTags(w, id, tags);
    if (structure) syncStructure(w, id, structure, new FieldErrors());
    // Files last: every DB check above has passed; a failed move undoes the moves and the writes.
    if (recategorised && uploadDir) moveProductImages(w, ops, id, categoryFolder(db, data.category_id));
  });
  return getProductDetail(db, id);
}

export function deleteProduct(w, id) {
  const db = w.db;
  const cur = getProductRow(db, id);
  if (!cur) throw notFound('product');
  db.transaction(() => {
    for (const r of db.stmt('SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL').all(id)) {
      softDeleteVariant(w, id, r);
    }
    for (const t of db.stmt('SELECT * FROM product_tags WHERE product_id = ? AND deleted_at IS NULL').all(id)) {
      w.softDelete('product_tags', t.id, id, t);
    }
    w.softDelete('products', id, id, cur);
  })();
}

const COPY_SUFFIX = { id: ' (salinan)', en: ' (copy)' };

/**
 * POST /products/:id/duplicate. New inactive product with the same category, scalars, axes/options,
 * variants (fresh auto SKUs, no barcodes, stock 0), wholesale tiers, tags and images (files copied).
 * Discounts are not copied. Every row is audited as 'create' in one save.
 */
export async function duplicateProduct(w, id, { lang = 'id', uploadDir }) {
  const db = w.db;
  const src = getProductRow(db, id);
  if (!src) throw notFound('product');
  const suffix = COPY_SUFFIX[lang] || COPY_SUFFIX.id;
  const name = `${src.name.slice(0, LIMITS.productName - suffix.length).trimEnd()}${suffix}`;

  const optPos = new Map(); // source option id -> [axisIdx, optionIdx]
  const axes = db.stmt('SELECT id, name FROM product_axes WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id')
    .all(id).map((a, k) => ({
      id: null,
      name: a.name,
      options: db.stmt('SELECT id, value FROM axis_options WHERE axis_id = ? AND deleted_at IS NULL ORDER BY position, id')
        .all(a.id).map((o, j) => { optPos.set(o.id, [k, j]); return { id: null, value: o.value }; }),
    }));
  const srcVars = db.stmt('SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').all(id);
  const links = db.stmt(
    `SELECT vo.variant_id, vo.option_id FROM variant_options vo
       JOIN product_variants pv ON pv.id = vo.variant_id
      WHERE pv.product_id = ? AND pv.deleted_at IS NULL AND vo.deleted_at IS NULL`
  ).all(id);
  const tiers = db.stmt(
    `SELECT t.variant_id, t.min_qty, t.price FROM wholesale_tiers t
       JOIN product_variants pv ON pv.id = t.variant_id
      WHERE pv.product_id = ? AND pv.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY t.min_qty`
  ).all(id);
  const kept = [];
  const variants = [];
  for (const sv of srcVars) {
    const optionIdx = axes.map(() => -1);
    for (const l of links) {
      const at = l.variant_id === sv.id ? optPos.get(l.option_id) : null;
      if (at) optionIdx[at[0]] = at[1];
    }
    if (optionIdx.includes(-1)) continue; // inconsistent combination: skip rather than copy garbage
    kept.push(sv);
    variants.push({
      idx: variants.length, id: null, optionIdx, sku: null, barcode: null, price: sv.price, stock: 0,
      weight_value: sv.weight_value, weight_unit_id: sv.weight_unit_id, weight_grams: sv.weight_grams, active: sv.active,
      wholesale: tiers.filter((t) => t.variant_id === sv.id).map(({ min_qty, price }) => ({ min_qty, price })),
    });
  }
  const tags = db.stmt('SELECT tag FROM product_tags WHERE product_id = ? AND deleted_at IS NULL ORDER BY id').pluck().all(id);
  const images = db.stmt('SELECT * FROM product_images WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').all(id);

  // Copy image files first (async) into the category folder; the DB part below is one transaction.
  const folder = categoryFolder(db, src.category_id);
  const copied = [];
  const cleanup = () => Promise.all(copied.flatMap((c) => [c.file, c.thumb])
    .map((n) => fs.rm(absPath(uploadDir, n), { force: true }).catch(() => {})));
  try {
    if (images.length) await fs.mkdir(absPath(uploadDir, folder), { recursive: true });
    for (const im of images) {
      const base = randomUUID();
      const file = joinRel(folder, `${base}.webp`);
      const thumb = joinRel(folder, `${base}.thumb.webp`);
      try {
        await fs.copyFile(absPath(uploadDir, im.file), absPath(uploadDir, file));
      } catch (e) {
        if (e.code === 'ENOENT') continue; // file gone from disk: skip that photo
        throw e;
      }
      const entry = { ...im, file, thumb };
      copied.push(entry);
      try {
        await fs.copyFile(absPath(uploadDir, im.thumb), absPath(uploadDir, thumb));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        entry.thumb = file; // no thumbnail on disk: fall back to the main file
      }
    }
  } catch (e) {
    await cleanup();
    throw e;
  }
  let coverIdx = copied.findIndex((c) => c.is_cover === 1);
  if (coverIdx < 0) coverIdx = 0;

  let newId;
  try {
    newId = withFileOps(db, uploadDir, (ops) => {
      const pid = w.insert('products', {
        name, description: src.description, category_id: src.category_id, condition: src.condition,
        status: 'inactive', preorder: src.preorder, preorder_days: src.preorder_days, min_purchase: src.min_purchase,
        length_cm: src.length_cm, width_cm: src.width_cm, height_cm: src.height_cm,
      });
      syncTags(w, pid, tags);
      syncStructure(w, pid, { axes, variants }, new FieldErrors());
      const newVars = db.stmt('SELECT id FROM product_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').pluck().all(pid);
      const varMap = new Map(kept.map((sv, i) => [sv.id, newVars[i]]));
      copied.forEach((c, i) => w.insert('product_images', {
        product_id: pid, variant_id: c.variant_id ? varMap.get(c.variant_id) ?? null : null,
        file: c.file, thumb: c.thumb, width: c.width, height: c.height, position: i, is_cover: i === coverIdx ? 1 : 0,
      }, pid));
      // No-op unless the category folder was renamed while the files were being copied.
      if (copied.length) moveProductImages(w, ops, pid, categoryFolder(db, src.category_id));
      return pid;
    });
  } catch (e) {
    await cleanup();
    throw e;
  }
  return getProductDetail(db, newId);
}

// ---------------------------------------------------------------------------
// Reads

function discountState(d, now) {
  if (d.ends_at <= now) return 'ended';
  if (d.starts_at > now) return 'scheduled';
  return 'active';
}

export function getProductDetail(db, id) {
  const p = getProductRow(db, id);
  if (!p) throw notFound('product');
  const now = nowWib();
  const axes = db.stmt('SELECT id, name, position FROM product_axes WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').all(id);
  const opts = db.stmt(
    `SELECT o.id, o.axis_id, o.value, o.position FROM axis_options o
       JOIN product_axes a ON a.id = o.axis_id
      WHERE a.product_id = ? AND a.deleted_at IS NULL AND o.deleted_at IS NULL ORDER BY o.position, o.id`
  ).all(id);
  const optById = new Map(opts.map((o) => [o.id, o]));
  const axisPos = new Map(axes.map((a, i) => [a.id, i]));
  for (const a of axes) a.options = opts.filter((o) => o.axis_id === a.id).map(({ id: oid, value, position }) => ({ id: oid, value, position }));

  const variants = db.stmt(
    `SELECT pv.id, pv.sku, pv.barcode, pv.price, pv.stock, pv.weight_value, pv.weight_unit_id, pv.weight_grams,
            pv.active, pv.position, u.symbol AS weight_unit_symbol,
            vp.effective_price, vp.discount_id, vp.discount_price, vp.discount_starts_at, vp.discount_ends_at
       FROM product_variants pv
       LEFT JOIN units u ON u.id = pv.weight_unit_id
       JOIN v_variant_price vp ON vp.variant_id = pv.id
      WHERE pv.product_id = ? AND pv.deleted_at IS NULL ORDER BY pv.position, pv.id`
  ).all(id);
  const links = db.stmt(
    `SELECT vo.variant_id, vo.option_id FROM variant_options vo
       JOIN product_variants pv ON pv.id = vo.variant_id
      WHERE pv.product_id = ? AND pv.deleted_at IS NULL AND vo.deleted_at IS NULL`
  ).all(id);
  const tiers = db.stmt(
    `SELECT t.id, t.variant_id, t.min_qty, t.price FROM wholesale_tiers t
       JOIN product_variants pv ON pv.id = t.variant_id
      WHERE pv.product_id = ? AND pv.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY t.min_qty`
  ).all(id);
  const discounts = db.stmt(
    `SELECT d.id, d.variant_id, d.price, d.starts_at, d.ends_at, d.batch_id, d.created_at FROM discounts d
       JOIN product_variants pv ON pv.id = d.variant_id
      WHERE pv.product_id = ? AND pv.deleted_at IS NULL AND d.deleted_at IS NULL ORDER BY d.starts_at, d.variant_id`
  ).all(id);
  const images = db.stmt(
    `SELECT id, variant_id, file, thumb, width, height, position, is_cover FROM product_images
      WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id`
  ).all(id);
  const tags = db.stmt('SELECT tag FROM product_tags WHERE product_id = ? AND deleted_at IS NULL ORDER BY id').pluck().all(id);
  const users = db.stmt('SELECT id, userid, name FROM users WHERE id IN (?, ?)').all(p.created_by, p.updated_by);
  const userOf = (uid) => users.find((u) => u.id === uid) || null;

  const vOut = variants.map((r) => {
    const optionIds = links.filter((l) => l.variant_id === r.id).map((l) => l.option_id)
      .sort((a, b) => axisPos.get(optById.get(a)?.axis_id) - axisPos.get(optById.get(b)?.axis_id));
    return {
      id: r.id,
      option_ids: optionIds,
      option_values: optionIds.map((oid) => optById.get(oid)?.value),
      sku: r.sku, barcode: r.barcode, price: r.price, stock: r.stock,
      weight_value: r.weight_value, weight_unit_id: r.weight_unit_id, weight_unit_symbol: r.weight_unit_symbol,
      weight_grams: r.weight_grams, active: r.active === 1, position: r.position,
      effective_price: r.effective_price,
      active_discount: r.discount_id
        ? { id: r.discount_id, price: r.discount_price, starts_at: r.discount_starts_at, ends_at: r.discount_ends_at }
        : null,
      wholesale: tiers.filter((t) => t.variant_id === r.id).map(({ id: tid, min_qty, price }) => ({ id: tid, min_qty, price })),
    };
  });

  return {
    id: p.id, name: p.name, description: p.description,
    category_id: p.category_id, category_path: categoryPath(db, p.category_id),
    condition: p.condition, preorder: p.preorder === 1, preorder_days: p.preorder_days,
    min_purchase: p.min_purchase, length_cm: p.length_cm, width_cm: p.width_cm, height_cm: p.height_cm,
    status: p.status,
    price_min: p.price_min, price_max: p.price_max, stock_total: p.stock_total, variant_count: p.variant_count,
    created_at: p.created_at, created_by: userOf(p.created_by), updated_at: p.updated_at, updated_by: userOf(p.updated_by),
    tags,
    axes,
    variants: vOut,
    discounts: discounts.map((d) => ({ ...d, state: discountState(d, now) })),
    images: images.map((im) => ({
      id: im.id, variant_id: im.variant_id, position: im.position, is_cover: im.is_cover === 1,
      width: im.width, height: im.height, ...imageUrls(im),
    })),
  };
}

const SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
  oldest: 'p.created_at ASC, p.id ASC',
  updated: 'p.updated_at DESC, p.id DESC',
  name_asc: 'p.name COLLATE NOCASE ASC, p.id ASC',
  name_desc: 'p.name COLLATE NOCASE DESC, p.id DESC',
  price_asc: 'p.price_min ASC, p.id ASC',
  price_desc: 'p.price_min DESC, p.id DESC',
  stock_asc: 'p.stock_total ASC, p.id ASC',
  stock_desc: 'p.stock_total DESC, p.id DESC',
};
export const PRODUCT_SORTS = Object.keys(SORTS);

/** Paged list. Aggregates (effective price, cover) are fetched only for the page rows (no N+1). */
export function listProducts(db, query = {}) {
  const errs = new FieldErrors();
  const page = v.int(errs, 'page', query.page, { min: 1, def: 1 });
  const pageSize = v.int(errs, 'page_size', query.page_size, { min: 1, max: LIMITS.pageSizeMax, def: LIMITS.pageSizeDefault });
  const sort = v.oneOf(errs, 'sort', query.sort, PRODUCT_SORTS, { def: 'newest' });
  const status = v.oneOf(errs, 'status', query.status, ['active', 'inactive'], { def: null });
  const categoryId = v.int(errs, 'category_id', query.category_id, { min: 1 });
  const q = v.str(errs, 'q', query.q, { max: 100 });
  const lowStock = v.bool(errs, 'low_stock', query.low_stock === '' ? undefined : query.low_stock, { def: false });
  errs.throwIfAny();

  const where = ['p.deleted_at IS NULL'];
  const params = [];
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (lowStock) {
    // Same rule as /stats and the low_stock flag. The status IN (...) lets SQLite seek the
    // (status, stock_min) index idx_products_status_stock even without a status filter.
    if (!status) where.push(`p.status IN ('active', 'inactive')`);
    where.push('p.stock_min <= ?');
    params.push(lowStockThreshold(db));
  }
  if (categoryId) {
    const ids = descendantIds(db, categoryId);
    if (ids.length === 0) return { items: [], total: 0, page, page_size: pageSize };
    where.push(`p.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const prefix = `${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push(`(p.name LIKE ? ESCAPE '\\'
      OR p.id IN (SELECT product_id FROM product_tags WHERE tag LIKE ? ESCAPE '\\' AND deleted_at IS NULL)
      OR p.id IN (SELECT product_id FROM product_variants WHERE (sku = ? COLLATE NOCASE OR barcode = ?) AND deleted_at IS NULL))`);
    params.push(like, prefix, q, q);
  }
  const whereSql = where.join(' AND ');
  const total = db.stmt(`SELECT COUNT(*) FROM products p WHERE ${whereSql}`).pluck().get(...params);
  const rows = db.stmt(
    `SELECT p.id, p.name, p.status, p.category_id, c.name AS category_name, p.price_min, p.price_max,
            p.stock_total, p.stock_min, p.variant_count, p.preorder, p.created_at, p.updated_at
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);
  if (rows.length === 0) return { items: [], total, page, page_size: pageSize };
  const threshold = lowStockThreshold(db);

  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const eff = new Map(db.stmt(
    `SELECT product_id, MIN(effective_price) AS emin, MAX(effective_price) AS emax, MAX(discount_id IS NOT NULL) AS has_discount
       FROM v_variant_price WHERE product_id IN (${ph}) AND active = 1 GROUP BY product_id`
  ).all(...ids).map((r) => [r.product_id, r]));
  const covers = new Map(db.stmt(
    `SELECT product_id, file, thumb FROM product_images WHERE product_id IN (${ph}) AND deleted_at IS NULL AND is_cover = 1`
  ).all(...ids).map((r) => [r.product_id, r]));

  const items = rows.map(({ stock_min: stockMin, ...r }) => {
    const e = eff.get(r.id);
    const cover = covers.get(r.id);
    return {
      ...r,
      preorder: r.preorder === 1,
      low_stock: stockMin !== null && stockMin <= threshold,
      effective_price_min: e ? e.emin : r.price_min,
      effective_price_max: e ? e.emax : r.price_max,
      has_discount: e ? e.has_discount === 1 : false,
      cover_thumb_url: cover ? imageUrls(cover).thumb_url : null,
    };
  });
  return { items, total, page, page_size: pageSize };
}
