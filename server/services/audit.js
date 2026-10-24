// Product audit history, grouped per save and rendered as human-friendly, bilingual changes.
// Raw audit_log rows stay available through rawProductAudit (GET /products/:id/audit?raw=1).
import { FieldErrors, notFound } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { LIMITS } from '../lib/limits.js';
import { formatWib, formatWibRange } from '../lib/time.js';
import { stockReasonLabel } from '../lib/i18n.js';

const HIDDEN = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'last_movement_id']);

function parse(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

function paging(query) {
  const errs = new FieldErrors();
  const page = v.int(errs, 'page', query.page, { min: 1, def: 1 });
  const pageSize = v.int(errs, 'page_size', query.page_size, { min: 1, max: LIMITS.pageSizeMax, def: 50 });
  errs.throwIfAny();
  return { page, pageSize };
}

const userOf = (r) => (r.user_id ? { id: r.user_id, userid: r.user_userid, name: r.user_name } : null);

/** One item per audit_log row (the original, low-level shape). */
export function rawProductAudit(db, productId, query = {}) {
  const { page, pageSize } = paging(query);
  const total = db.stmt('SELECT COUNT(*) FROM audit_log WHERE product_id = ?').pluck().get(productId);
  const rows = db.stmt(
    `SELECT a.*, u.userid AS user_userid, u.name AS user_name FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.product_id = ? ORDER BY a.id DESC LIMIT ? OFFSET ?`
  ).all(productId, pageSize, (page - 1) * pageSize);
  const items = rows.map((r) => {
    const before = parse(r.before_json);
    const after = parse(r.after_json);
    let changes = [];
    if (r.action === 'update' && before && after) {
      changes = Object.keys(after)
        .filter((k) => !HIDDEN.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        .map((k) => ({ field: k, from: before[k] ?? null, to: after[k] ?? null }));
    }
    return {
      id: r.id, at: r.at, action: r.action, table_name: r.table_name, record_id: r.record_id,
      user: userOf(r), changes, before, after,
    };
  });
  return { items, total, page, page_size: pageSize };
}

// ---------------------------------------------------------------------------
// Words

const W = {
  id: {
    summary: {
      created: 'Produk dibuat', updated: 'Produk diubah', deleted: 'Produk dihapus', stock_changed: 'Stok diubah',
      discount_added: 'Diskon ditambahkan', discount_removed: 'Diskon dihapus',
      images_added: 'Foto ditambahkan', images_removed: 'Foto dihapus', images_updated: 'Foto diubah',
    },
    field: {
      name: 'Nama', description: 'Deskripsi', category_id: 'Kategori', condition: 'Kondisi', status: 'Status',
      preorder: 'Pre-order', preorder_days: 'Lama pre-order', min_purchase: 'Minimal pembelian',
      length_cm: 'Panjang', width_cm: 'Lebar', height_cm: 'Tinggi',
      sku: 'SKU', barcode: 'Barcode', price: 'Harga', weight: 'Berat', active: 'Varian aktif',
      wholesale_price: 'Harga grosir', discount: 'Diskon', tag: 'Tag', stock: 'Stok',
      axis: 'Variasi', axis_name: 'Nama variasi', option: 'Pilihan', image: 'Foto', image_variant: 'Varian foto',
      variant: 'Varian',
    },
    value: { new: 'Baru', used: 'Bekas', active: 'Aktif', inactive: 'Nonaktif', yes: 'Ya', no: 'Tidak', empty: '(kosong)' },
    days: (n) => `${n} hari`,
    minQty: (n) => `min. ${n} pcs`,
    productCreated: 'Produk dibuat',
    productDeleted: 'Produk dihapus',
    added: 'ditambahkan',
    removed: 'dihapus',
    imagesReordered: 'Urutan foto diubah',
    coverChanged: 'Foto sampul diganti',
    imageAdded: 'Foto ditambahkan',
    imageRemoved: 'Foto dihapus',
    noVariant: 'semua varian',
  },
  en: {
    summary: {
      created: 'Product created', updated: 'Product updated', deleted: 'Product deleted', stock_changed: 'Stock changed',
      discount_added: 'Discount added', discount_removed: 'Discount removed',
      images_added: 'Photos added', images_removed: 'Photos removed', images_updated: 'Photos updated',
    },
    field: {
      name: 'Name', description: 'Description', category_id: 'Category', condition: 'Condition', status: 'Status',
      preorder: 'Pre-order', preorder_days: 'Pre-order time', min_purchase: 'Minimum purchase',
      length_cm: 'Length', width_cm: 'Width', height_cm: 'Height',
      sku: 'SKU', barcode: 'Barcode', price: 'Price', weight: 'Weight', active: 'Variant active',
      wholesale_price: 'Wholesale price', discount: 'Discount', tag: 'Tag', stock: 'Stock',
      axis: 'Variation', axis_name: 'Variation name', option: 'Option', image: 'Photo', image_variant: 'Photo variant',
      variant: 'Variant',
    },
    value: { new: 'New', used: 'Used', active: 'Active', inactive: 'Inactive', yes: 'Yes', no: 'No', empty: '(empty)' },
    days: (n) => `${n} day${n === 1 ? '' : 's'}`,
    minQty: (n) => `min. ${n} pcs`,
    productCreated: 'Product created',
    productDeleted: 'Product deleted',
    added: 'added',
    removed: 'removed',
    imagesReordered: 'Photo order changed',
    coverChanged: 'Cover photo changed',
    imageAdded: 'Photo added',
    imageRemoved: 'Photo removed',
    noVariant: 'all variants',
  },
};

const rupiah = (n) => (n === null || n === undefined ? null : `Rp ${Number(n).toLocaleString('id-ID')}`);
const num = (n) => (n === null || n === undefined ? null : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 3 }));
const clip = (s, max = 80) => (s && s.length > max ? `${s.slice(0, max - 1)}…` : s);

// ---------------------------------------------------------------------------
// Context lookups (variant labels, category names, unit symbols), batched per page.

function buildContext(db, productId, rows) {
  const variantIds = new Set();
  const categoryIds = new Set();
  const unitIds = new Set();
  const axisIds = new Set();
  for (const r of rows) {
    for (const o of [r.before, r.after]) {
      if (!o) continue;
      if (r.table_name === 'product_variants') { variantIds.add(r.record_id); if (o.weight_unit_id) unitIds.add(o.weight_unit_id); }
      if (o.variant_id) variantIds.add(o.variant_id);
      if (r.table_name === 'products' && o.category_id) categoryIds.add(o.category_id);
      if (r.table_name === 'axis_options' && o.axis_id) axisIds.add(o.axis_id);
    }
  }
  const inList = (set) => [...set].map(() => '?').join(',');

  const variants = new Map();
  if (variantIds.size) {
    const ids = [...variantIds];
    for (const pv of db.prepare(`SELECT id, sku FROM product_variants WHERE id IN (${inList(variantIds)})`).all(...ids)) {
      variants.set(pv.id, { sku: pv.sku, values: [] });
    }
    // Option values: live links first; for removed variants, the links that were removed last.
    const links = db.prepare(
      `SELECT vo.variant_id, vo.deleted_at, o.value, a.position, a.id AS axis_id FROM variant_options vo
         JOIN axis_options o ON o.id = vo.option_id JOIN product_axes a ON a.id = o.axis_id
        WHERE vo.variant_id IN (${inList(variantIds)}) ORDER BY a.position, a.id`
    ).all(...ids);
    const byVar = new Map();
    for (const l of links) {
      if (!byVar.has(l.variant_id)) byVar.set(l.variant_id, []);
      byVar.get(l.variant_id).push(l);
    }
    for (const [vid, ls] of byVar) {
      const live = ls.filter((l) => !l.deleted_at);
      let use = live;
      if (!use.length) {
        const last = ls.reduce((m, l) => (l.deleted_at > m ? l.deleted_at : m), '');
        use = ls.filter((l) => l.deleted_at === last);
      }
      if (variants.has(vid)) variants.get(vid).values = use.map((l) => l.value);
    }
  }
  const categories = new Map(categoryIds.size
    ? db.prepare(`SELECT id, name FROM categories WHERE id IN (${inList(categoryIds)})`).all(...categoryIds).map((c) => [c.id, c.name])
    : []);
  const units = new Map(unitIds.size
    ? db.prepare(`SELECT id, symbol FROM units WHERE id IN (${inList(unitIds)})`).all(...unitIds).map((u) => [u.id, u.symbol])
    : []);
  const axes = new Map(axisIds.size
    ? db.prepare(`SELECT id, name FROM product_axes WHERE id IN (${inList(axisIds)})`).all(...axisIds).map((a) => [a.id, a.name])
    : []);

  /** 'Pedas / 250 g (PK1-1)'; a variant without options (single-variant product) is just its SKU. */
  const variantLabel = (id, sku = null) => {
    const x = variants.get(id);
    const s = sku || x?.sku || `#${id}`;
    return x?.values.length ? `${x.values.join(' / ')} (${s})` : s;
  };
  const hasOptions = (id) => Boolean(variants.get(id)?.values.length);
  return { variantLabel, hasOptions, categories, units, axes, productId };
}

// ---------------------------------------------------------------------------
// Row -> changes

function describeGroup(rows, ctx, lang) {
  const L = W[lang] || W.id;
  const F = L.field;
  const out = [];
  const once = new Set();
  const yesNo = (b) => (b ? L.value.yes : L.value.no);
  const show = (x) => (x === null || x === undefined || x === '' ? L.value.empty : String(x));

  const push = (r, c) => {
    const variantPrefix = c.variant_id && ctx.hasOptions(c.variant_id) ? `${ctx.variantLabel(c.variant_id)} · ` : '';
    let text;
    if (c.text) text = `${variantPrefix}${c.text}`;
    else text = `${variantPrefix}${c.label}: ${show(c.from)} → ${show(c.to)}`;
    out.push({
      table: r.table_name, record_id: r.record_id, entity: c.entity, kind: c.kind,
      variant: c.variant_id ? ctx.variantLabel(c.variant_id) : null,
      field: c.field ?? null, label: c.label ?? null,
      from: c.from === undefined ? null : c.from, to: c.to === undefined ? null : c.to,
      text,
    });
  };
  const changed = (b, a, k) => JSON.stringify(b?.[k] ?? null) !== JSON.stringify(a?.[k] ?? null);
  const weight = (o) => (o && o.weight_value !== null && o.weight_value !== undefined
    ? `${num(o.weight_value)} ${ctx.units.get(o.weight_unit_id) || ''}`.trim() : null);

  const optionsByAxis = new Map(); // axis created/removed in this group -> option values
  for (const r of rows) {
    if (r.table_name !== 'axis_options' || r.action === 'update') continue;
    const o = r.after || r.before;
    const key = `${r.action}:${o.axis_id}`;
    if (!optionsByAxis.has(key)) optionsByAxis.set(key, []);
    optionsByAxis.get(key).push(o.value);
  }
  const axisInGroup = new Set(rows.filter((r) => r.table_name === 'product_axes' && r.action !== 'update').map((r) => `${r.action}:${r.record_id}`));

  for (const r of rows) {
    const { before: b, after: a, action } = r;
    const o = a || b || {};
    switch (r.table_name) {
      case 'products': {
        if (action === 'create') push(r, { entity: 'product', kind: 'added', text: `${L.productCreated}: ${o.name}` });
        else if (action === 'delete') push(r, { entity: 'product', kind: 'removed', text: `${L.productDeleted}: ${o.name}` });
        else {
          for (const k of ['name', 'description', 'category_id', 'condition', 'status', 'preorder', 'preorder_days',
            'min_purchase', 'length_cm', 'width_cm', 'height_cm']) {
            if (!changed(b, a, k)) continue;
            let fmt = (x) => x;
            if (k === 'description') fmt = (x) => clip(x);
            else if (k === 'category_id') fmt = (x) => (x ? ctx.categories.get(x) || `#${x}` : null);
            else if (k === 'condition' || k === 'status') fmt = (x) => (x ? L.value[x] || x : null);
            else if (k === 'preorder') fmt = (x) => yesNo(x);
            else if (k === 'preorder_days') fmt = (x) => (x ? L.days(x) : null);
            else if (k.endsWith('_cm')) fmt = (x) => (x === null ? null : `${num(x)} cm`);
            push(r, { entity: 'product', kind: 'changed', field: k, label: F[k], from: fmt(b[k]), to: fmt(a[k]) });
          }
        }
        break;
      }
      case 'product_variants': {
        const vid = r.record_id;
        if (action === 'create') {
          push(r, { entity: 'variant', kind: 'added', text: `${F.variant} ${L.added}: ${ctx.variantLabel(vid, o.sku)} (${rupiah(o.price)})` });
        } else if (action === 'delete') {
          push(r, { entity: 'variant', kind: 'removed', text: `${F.variant} ${L.removed}: ${ctx.variantLabel(vid, o.sku)}` });
        } else {
          if (changed(b, a, 'price')) push(r, { entity: 'variant', variant_id: vid, kind: 'changed', field: 'price', label: F.price, from: rupiah(b.price), to: rupiah(a.price) });
          if (changed(b, a, 'sku')) push(r, { entity: 'variant', variant_id: vid, kind: 'changed', field: 'sku', label: F.sku, from: b.sku, to: a.sku });
          if (changed(b, a, 'barcode')) push(r, { entity: 'variant', variant_id: vid, kind: 'changed', field: 'barcode', label: F.barcode, from: b.barcode, to: a.barcode });
          if (changed(b, a, 'weight_value') || changed(b, a, 'weight_unit_id')) {
            push(r, { entity: 'variant', variant_id: vid, kind: 'changed', field: 'weight', label: F.weight, from: weight(b), to: weight(a) });
          }
          if (changed(b, a, 'active')) push(r, { entity: 'variant', variant_id: vid, kind: 'changed', field: 'active', label: F.active, from: yesNo(b.active), to: yesNo(a.active) });
        }
        break;
      }
      case 'wholesale_tiers': {
        const vid = o.variant_id;
        const tier = `${F.wholesale_price} (${L.minQty(o.min_qty)})`;
        if (action === 'create') push(r, { entity: 'wholesale', variant_id: vid, kind: 'added', field: 'price', label: tier, from: null, to: rupiah(o.price), text: `${tier} ${L.added}: ${rupiah(o.price)}` });
        else if (action === 'delete') push(r, { entity: 'wholesale', variant_id: vid, kind: 'removed', field: 'price', label: tier, from: rupiah(o.price), to: null, text: `${tier} ${L.removed}` });
        else if (changed(b, a, 'price')) push(r, { entity: 'wholesale', variant_id: vid, kind: 'changed', field: 'price', label: tier, from: rupiah(b.price), to: rupiah(a.price) });
        break;
      }
      case 'discounts': {
        const vid = o.variant_id;
        const desc = `${rupiah(o.price)}, ${formatWibRange(o.starts_at, o.ends_at, lang)}`;
        if (action === 'create') push(r, { entity: 'discount', variant_id: vid, kind: 'added', field: 'discount', label: F.discount, from: null, to: desc, text: `${F.discount} ${L.added}: ${desc}` });
        else if (action === 'delete') push(r, { entity: 'discount', variant_id: vid, kind: 'removed', field: 'discount', label: F.discount, from: desc, to: null, text: `${F.discount} ${L.removed}: ${desc}` });
        else if (changed(b, a, 'price')) push(r, { entity: 'discount', variant_id: vid, kind: 'changed', field: 'price', label: F.discount, from: rupiah(b.price), to: rupiah(a.price) });
        break;
      }
      case 'stock_movements': {
        if (action !== 'create') break;
        const q = Number(o.qty_change);
        const qty = `${q > 0 ? '+' : ''}${q.toLocaleString('id-ID')}`;
        const why = stockReasonLabel(o.reason, lang);
        const note = o.note ? ` – ${clip(o.note, 60)}` : '';
        push(r, { entity: 'stock', variant_id: o.variant_id, kind: 'changed', field: 'stock', label: F.stock, from: null, to: qty, text: `${F.stock}: ${qty} (${why})${note}` });
        break;
      }
      case 'product_tags': {
        if (action === 'create') push(r, { entity: 'tag', kind: 'added', field: 'tag', label: F.tag, from: null, to: o.tag, text: `${F.tag} ${L.added}: ${o.tag}` });
        else if (action === 'delete') push(r, { entity: 'tag', kind: 'removed', field: 'tag', label: F.tag, from: o.tag, to: null, text: `${F.tag} ${L.removed}: ${o.tag}` });
        else if (changed(b, a, 'tag')) push(r, { entity: 'tag', kind: 'changed', field: 'tag', label: F.tag, from: b.tag, to: a.tag });
        break;
      }
      case 'product_axes': {
        if (action === 'update') {
          if (changed(b, a, 'name')) push(r, { entity: 'variation', kind: 'changed', field: 'name', label: F.axis_name, from: b.name, to: a.name });
          break;
        }
        const opts = optionsByAxis.get(`${action}:${r.record_id}`) || [];
        const list = opts.length ? ` (${opts.join(', ')})` : '';
        push(r, { entity: 'variation', kind: action === 'create' ? 'added' : 'removed', text: `${F.axis} ${action === 'create' ? L.added : L.removed}: ${o.name}${list}` });
        break;
      }
      case 'axis_options': {
        const axisName = ctx.axes.get(o.axis_id) || '';
        const label = axisName ? `${F.option} ${axisName}` : F.option;
        if (action === 'update') {
          if (changed(b, a, 'value')) push(r, { entity: 'option', kind: 'changed', field: 'value', label, from: b.value, to: a.value });
          break;
        }
        if (axisInGroup.has(`${action}:${o.axis_id}`)) break; // already listed with its variation
        push(r, { entity: 'option', kind: action === 'create' ? 'added' : 'removed', text: `${label} ${action === 'create' ? L.added : L.removed}: ${o.value}` });
        break;
      }
      case 'product_images': {
        if (action === 'create') push(r, { entity: 'image', kind: 'added', text: L.imageAdded });
        else if (action === 'delete') push(r, { entity: 'image', kind: 'removed', text: L.imageRemoved });
        else {
          if (changed(b, a, 'position') && !once.has('reorder')) {
            once.add('reorder');
            push(r, { entity: 'image', kind: 'changed', field: 'position', text: L.imagesReordered });
          }
          if (changed(b, a, 'is_cover') && a.is_cover === 1 && !once.has('cover')) {
            once.add('cover');
            push(r, { entity: 'image', kind: 'changed', field: 'is_cover', text: L.coverChanged });
          }
          if (changed(b, a, 'variant_id')) {
            const lab = (x) => (x ? ctx.variantLabel(x) : L.noVariant);
            push(r, { entity: 'image', kind: 'changed', field: 'variant_id', label: F.image_variant, from: lab(b.variant_id), to: lab(a.variant_id) });
          }
        }
        break;
      }
      default:
        break; // variant_options: implied by the variant lines
    }
  }
  return out;
}

function summaryAction(rows) {
  const t = (name, act) => rows.filter((r) => r.table_name === name && (!act || r.action === act));
  if (t('products', 'create').length) return 'created';
  if (t('products', 'delete').length) return 'deleted';
  const meaningful = rows.filter((r) => r.table_name !== 'variant_options');
  const only = (name, act) => meaningful.length > 0 && meaningful.every((r) => r.table_name === name && (!act || r.action === act));
  if (only('stock_movements')) return 'stock_changed';
  if (only('discounts', 'create')) return 'discount_added';
  if (only('discounts', 'delete')) return 'discount_removed';
  if (only('product_images')) {
    if (t('product_images', 'create').length) return 'images_added';
    if (t('product_images', 'delete').length) return 'images_removed';
    return 'images_updated';
  }
  return 'updated';
}

// ---------------------------------------------------------------------------

const GROUP_BY = `IFNULL(user_id, 0), at, IFNULL(txn, '')`;

/**
 * Audit history grouped per save: rows with the same user, same second (WIB) and same request
 * (audit_log.txn) form one entry with a summary action and readable changes in `lang`.
 */
export function productAudit(db, productId, query = {}, lang = 'id') {
  if (!db.stmt('SELECT 1 FROM products WHERE id = ?').get(productId)) throw notFound('product');
  if (query.raw === '1' || query.raw === 'true') return rawProductAudit(db, productId, query);
  const { page, pageSize } = paging(query);
  const total = db.stmt(
    `SELECT COUNT(*) FROM (SELECT 1 FROM audit_log WHERE product_id = ? GROUP BY ${GROUP_BY})`
  ).pluck().get(productId);
  const groups = db.stmt(
    `SELECT user_id, at, txn, MIN(id) AS first_id, MAX(id) AS last_id FROM audit_log
      WHERE product_id = ? GROUP BY ${GROUP_BY} ORDER BY last_id DESC LIMIT ? OFFSET ?`
  ).all(productId, pageSize, (page - 1) * pageSize);
  if (groups.length === 0) return { items: [], total, page, page_size: pageSize };

  const lo = Math.min(...groups.map((g) => g.first_id));
  const hi = Math.max(...groups.map((g) => g.last_id));
  const rows = db.stmt(
    `SELECT a.*, u.userid AS user_userid, u.name AS user_name FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.product_id = ? AND a.id BETWEEN ? AND ? ORDER BY a.id`
  ).all(productId, lo, hi).map((r) => ({ ...r, before: parse(r.before_json), after: parse(r.after_json) }));
  const keyOf = (r) => `${r.user_id ?? 0}|${r.at}|${r.txn ?? ''}`;
  const byKey = new Map(groups.map((g) => [keyOf(g), []]));
  for (const r of rows) byKey.get(keyOf(r))?.push(r);

  const ctx = buildContext(db, productId, rows.filter((r) => byKey.has(keyOf(r))));
  const L = W[lang] || W.id;
  const items = groups.map((g) => {
    const list = byKey.get(keyOf(g));
    const action = summaryAction(list);
    return {
      id: g.last_id,
      at: g.at,
      at_text: formatWib(g.at, lang, { suffix: true }),
      user: userOf(list[0]),
      action,
      summary: L.summary[action],
      changes: describeGroup(list, ctx, lang),
      entry_ids: list.map((r) => r.id),
    };
  });
  return { items, total, page, page_size: pageSize };
}
