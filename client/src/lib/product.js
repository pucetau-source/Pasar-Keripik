// Single place that maps API <-> form model. Align with server/API.md here only.
import { asList } from './api.js';

let seq = 0;
export const uid = (p = 'u') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const imgUrl = (f) => (!f ? '' : /^(https?:)?\/\//.test(f) || f.startsWith('/') ? f : '/uploads/' + f);

export const emptyVariant = (combo = [], extra = {}) => ({
  key: combo.join('|'), combo, id: null, sku: '', barcode: '', price: '', stock: '', weight_value: '', weight_unit_id: '',
  active: true, tiers: [], discounts: [], ...extra,
});

export const emptyForm = () => ({
  name: '', description: '', category_id: null, tags: [], condition: 'new', preorder: false, preorder_days: '',
  min_purchase: 1, length_cm: '', width_cm: '', height_cm: '', status: 'active',
  axes: [], variants: [emptyVariant()], images: [],
});

const S = (v) => (v == null ? '' : String(v));

export function normListItem(p) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    category_id: p.category_id ?? p.category?.id ?? null,
    category_name: p.category_name || p.category?.name || '',
    thumb: p.cover_thumb_url || p.cover_thumb || p.thumb || '',
    price_min: p.price_min ?? p.min_price ?? p.price ?? null,
    price_max: p.price_max ?? p.max_price ?? p.price ?? null,
    eff_min: p.effective_price_min ?? p.price_min ?? null,
    eff_max: p.effective_price_max ?? p.price_max ?? null,
    stock: p.stock_total ?? p.total_stock ?? p.stock ?? 0,
    variant_count: p.variant_count ?? p.variants_count ?? 1,
    low_stock: !!p.low_stock,
    has_discount: !!(p.has_discount ?? p.discount_active ?? p.on_discount),
  };
}

export function normList(d) {
  const items = asList(d).map(normListItem);
  const total = d?.total ?? d?.pagination?.total ?? items.length;
  const page = d?.page ?? d?.pagination?.page ?? 1;
  const size = d?.page_size ?? d?.pagination?.page_size ?? 20;
  return { items, total, page, pages: Math.max(1, Math.ceil(total / size)) };
}

export function fromApi(d) {
  const axes = (d.axes || []).map((a) => ({
    uid: 'a' + a.id, id: a.id, name: a.name,
    options: (a.options || []).map((o) => ({ uid: 'o' + o.id, id: o.id, value: o.value })),
  }));
  const variants = (d.variants || []).map((v) => {
    const ids = new Set((v.option_ids || []).map(String));
    const combo = axes.map((a) => a.options.find((o) => ids.has(String(o.id)))?.uid).filter(Boolean);
    return {
      key: combo.join('|'), combo, id: v.id, sku: S(v.sku), barcode: S(v.barcode), price: v.price ?? '', stock: v.stock ?? 0,
      weight_value: S(v.weight_value), weight_unit_id: v.weight_unit_id ?? '', active: v.active == null ? true : !!v.active,
      tiers: (v.wholesale || []).map((t) => ({ min_qty: t.min_qty, price: t.price })),
      discounts: (d.discounts || []).filter((x) => x.variant_id === v.id).map((x) => ({ id: x.id, price: x.price, starts_at: x.starts_at, ends_at: x.ends_at, batch_id: x.batch_id, state: x.state })),
    };
  });
  return {
    id: d.id, name: S(d.name), description: S(d.description), category_id: d.category_id ?? null,
    tags: (d.tags || []).map((t) => (typeof t === 'string' ? t : t.tag)),
    condition: d.condition || 'new', preorder: !!d.preorder, preorder_days: d.preorder_days ?? '',
    min_purchase: d.min_purchase ?? 1, length_cm: S(d.length_cm), width_cm: S(d.width_cm), height_cm: S(d.height_cm),
    status: d.status || 'active', axes, variants: variants.length ? variants : [emptyVariant()],
    images: (d.images || []).map((i) => ({ id: i.id, file: i.file, thumb: i.thumb, url: imgUrl(i.url || i.file), thumbUrl: imgUrl(i.thumb_url || i.thumb || i.file), is_cover: !!i.is_cover })),
  };
}

const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

export function toApi(f, isNew) {
  const axes = f.axes.map((a) => ({ ...a, options: a.options.filter((o) => o.value.trim()) })).filter((a) => a.name.trim() && a.options.length);
  const valueOf = (uidv) => axes.flatMap((a) => a.options).find((o) => o.uid === uidv)?.value;
  return {
    name: f.name.trim(),
    description: f.description,
    category_id: f.category_id,
    condition: f.condition,
    preorder: !!f.preorder,
    preorder_days: f.preorder ? numOrNull(f.preorder_days) : null,
    min_purchase: numOrNull(f.min_purchase) ?? 1,
    length_cm: numOrNull(f.length_cm), width_cm: numOrNull(f.width_cm), height_cm: numOrNull(f.height_cm),
    status: f.status,
    tags: f.tags,
    axes: axes.map((a) => ({ id: a.id, name: a.name.trim(), options: a.options.map((o) => ({ id: o.id, value: o.value.trim() })) })),
    variants: f.variants.map((v) => ({
      id: v.id || undefined,
      option_values: v.combo.map(valueOf),
      sku: v.sku.trim() || null,
      barcode: v.barcode.trim() || null,
      price: numOrNull(v.price),
      ...(isNew || !v.id ? { stock: numOrNull(v.stock) ?? 0 } : {}),
      weight_value: numOrNull(v.weight_value),
      weight_unit_id: v.weight_unit_id === '' ? null : Number(v.weight_unit_id),
      active: !!v.active,
      wholesale: v.tiers.filter((t) => t.min_qty !== '' && t.price !== '').map((t) => ({ min_qty: Number(t.min_qty), price: Number(t.price) })),
    })),
  };
}

// Variant combinations (cartesian product of option uids), only axes with options
export function combos(axes) {
  const use = axes.filter((a) => a.options.some((o) => o.value.trim()));
  let out = [[]];
  for (const a of use) out = out.flatMap((c) => a.options.filter((o) => o.value.trim()).map((o) => [...c, o.uid]));
  return use.length ? out : [[]];
}

// Rebuild variants after axes changed, keeping data by stable option uids
export function syncVariants(axes, old) {
  const map = new Map(old.map((v) => [v.key, v]));
  const base = old.length === 1 && old[0].combo.length === 0 ? old[0] : null;
  return combos(axes).map((c) => {
    const key = c.join('|');
    const hit = map.get(key);
    if (hit) return { ...hit, combo: c };
    // new row: inherit price/weight from the first existing row as a convenience
    const src = base || old[0];
    return emptyVariant(c, src ? { price: src.price, weight_value: src.weight_value, weight_unit_id: src.weight_unit_id } : {});
  });
}

export function variantLabel(v, axes) {
  if (!v.combo.length) return null;
  const opts = axes.flatMap((a) => a.options);
  return v.combo.map((u) => opts.find((o) => o.uid === u)?.value || '?').join(' / ');
}
