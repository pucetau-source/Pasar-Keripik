// Turns raw audit rows into one readable card per save: who, when (WIB), a summary and a plain change list.
// No raw column names or record ids ever reach the UI.
import { fmtWib, num, rupiah } from './format.js';

const L = {
  id: {
    topic: { product: 'Informasi produk', variant: 'Varian', price: 'Harga', stock: 'Stok', wholesale: 'Harga grosir', discount: 'Diskon', photo: 'Foto', tag: 'Tag', axis: 'Variasi', other: 'Lainnya' },
    created: 'Produk dibuat', deleted: 'Produk dihapus', changed: 'Mengubah', more: 'dan {n} lainnya', noDetail: 'Perubahan tersimpan.', empty: '(kosong)',
    yes: 'Ya', no: 'Tidak', sold: 'dijual', notSold: 'tidak dijual', active: 'Aktif', inactive: 'Nonaktif', cond: { new: 'Baru', used: 'Bekas' },
    field: {
      name: 'Nama produk', description: 'Deskripsi', category_id: 'Kategori', condition: 'Kondisi', preorder: 'Pre-order', preorder_days: 'Lama pre-order (hari)',
      min_purchase: 'Minimal pembelian', length_cm: 'Panjang (cm)', width_cm: 'Lebar (cm)', height_cm: 'Tinggi (cm)', status: 'Status produk',
      sku: 'SKU', barcode: 'Barcode', price: 'Harga', weight_value: 'Berat', weight_unit_id: 'Satuan berat', active: 'Dijual',
    },
    line: {
      variantNew: 'Varian ditambahkan: {v}', variantDel: 'Varian dihapus: {v}', variantN: '{n} varian ditambahkan', variantDelN: '{n} varian dihapus',
      change: '{f}{v}: {a} → {b}', changeNoVar: '{f}: {a} → {b}', textChanged: '{f} diubah',
      wsNew: 'Harga grosir ditambahkan{v}: mulai {q} pcs, {p} per item', wsDel: 'Harga grosir dihapus{v}: mulai {q} pcs', wsChg: 'Harga grosir{v} (mulai {q} pcs): {a} → {b}',
      wsNewN: '{n} harga grosir ditambahkan', wsDelN: '{n} harga grosir dihapus',
      discNew: 'Diskon {p}{v}, {from} sampai {to}', discDel: 'Diskon dihapus{v}: {p}', discNewN: 'Diskon ditambahkan untuk {n} varian ({p})', discDelN: 'Diskon dihapus untuk {n} varian', discChg: 'Diskon{v} diubah',
      photoNew: 'Foto ditambahkan', photoDel: 'Foto dihapus', photoCover: 'Foto sampul diganti', photoNewN: '{n} foto ditambahkan', photoDelN: '{n} foto dihapus', photoChg: 'Foto diperbarui',
      tagNew: 'Tag ditambahkan: {t}', tagDel: 'Tag dihapus: {t}',
      axisNew: 'Variasi ditambahkan: {t}', axisDel: 'Variasi dihapus: {t}', axisRen: 'Nama variasi: {a} → {b}',
      optNew: 'Pilihan ditambahkan: {t}', optDel: 'Pilihan dihapus: {t}', optRen: 'Pilihan: {a} → {b}',
      stock: 'Stok{v}: {q}{r}', stockN: '{n} perubahan stok',
    },
    forVar: ' ({v})', someVariant: 'sebuah varian', reasons: { initial: 'stok awal', restock: 'tambah stok', adjustment: 'penyesuaian', stock_opname: 'stok opname', damaged: 'rusak', expired: 'kedaluwarsa', return: 'retur', sale: 'penjualan' },
    unknownUser: 'Pengguna tidak dikenal', by: 'oleh', changes: '{n} perubahan', hide: 'Sembunyikan rincian', show: 'Lihat rincian',
  },
  en: {
    topic: { product: 'Product details', variant: 'Variants', price: 'Price', stock: 'Stock', wholesale: 'Wholesale', discount: 'Discounts', photo: 'Photos', tag: 'Tags', axis: 'Variations', other: 'Other' },
    created: 'Product created', deleted: 'Product deleted', changed: 'Changed', more: 'and {n} more', noDetail: 'Changes saved.', empty: '(empty)',
    yes: 'Yes', no: 'No', sold: 'on sale', notSold: 'not on sale', active: 'Active', inactive: 'Inactive', cond: { new: 'New', used: 'Used' },
    field: {
      name: 'Product name', description: 'Description', category_id: 'Category', condition: 'Condition', preorder: 'Pre-order', preorder_days: 'Pre-order days',
      min_purchase: 'Minimum purchase', length_cm: 'Length (cm)', width_cm: 'Width (cm)', height_cm: 'Height (cm)', status: 'Product status',
      sku: 'SKU', barcode: 'Barcode', price: 'Price', weight_value: 'Weight', weight_unit_id: 'Weight unit', active: 'On sale',
    },
    line: {
      variantNew: 'Variant added: {v}', variantDel: 'Variant removed: {v}', variantN: '{n} variants added', variantDelN: '{n} variants removed',
      change: '{f}{v}: {a} → {b}', changeNoVar: '{f}: {a} → {b}', textChanged: '{f} changed',
      wsNew: 'Wholesale price added{v}: from {q} pcs, {p} each', wsDel: 'Wholesale price removed{v}: from {q} pcs', wsChg: 'Wholesale{v} (from {q} pcs): {a} → {b}',
      wsNewN: '{n} wholesale prices added', wsDelN: '{n} wholesale prices removed',
      discNew: 'Discount {p}{v}, {from} to {to}', discDel: 'Discount removed{v}: {p}', discNewN: 'Discount added for {n} variants ({p})', discDelN: 'Discount removed for {n} variants', discChg: 'Discount{v} changed',
      photoNew: 'Photo added', photoDel: 'Photo removed', photoCover: 'Cover photo changed', photoNewN: '{n} photos added', photoDelN: '{n} photos removed', photoChg: 'Photo updated',
      tagNew: 'Tag added: {t}', tagDel: 'Tag removed: {t}',
      axisNew: 'Variation added: {t}', axisDel: 'Variation removed: {t}', axisRen: 'Variation name: {a} → {b}',
      optNew: 'Option added: {t}', optDel: 'Option removed: {t}', optRen: 'Option: {a} → {b}',
      stock: 'Stock{v}: {q}{r}', stockN: '{n} stock changes',
    },
    forVar: ' ({v})', someVariant: 'a variant', reasons: { initial: 'initial stock', restock: 'restock', adjustment: 'adjustment', stock_opname: 'stock count', damaged: 'damaged', expired: 'expired', return: 'return', sale: 'sale' },
    unknownUser: 'Unknown user', by: 'by', changes: '{n} changes', hide: 'Hide details', show: 'Show details',
  },
};

const fill = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
const parse = (s) => { if (s && typeof s === 'object') return s; try { return s ? JSON.parse(s) : null; } catch { return null; } };
const MONEY = new Set(['price']);

// ctx: { lang, variants: Map(id -> {label, sku}), categories: Map(id -> path), units: Map(id -> symbol), reasons: {key:{id,en}} }
export function buildGroups(items, ctx) {
  const T = L[ctx.lang] || L.id;
  const reasonText = (r) => ctx.reasons?.[r]?.[ctx.lang] || T.reasons[r] || r;
  const vOf = (id, row) => { const i = ctx.variants.get(id); return i?.label || i?.sku || row?.sku || null; };
  const forVar = (name) => (name ? fill(T.forVar, { v: name }) : '');

  const fmt = (field, v) => {
    if (v === null || v === undefined || v === '') return T.empty;
    if (MONEY.has(field)) return rupiah(v);
    if (field === 'active' || field === 'preorder') return Number(v) ? (field === 'active' ? T.sold : T.yes) : (field === 'active' ? T.notSold : T.no);
    if (field === 'status') return v === 'active' ? T.active : T.inactive;
    if (field === 'condition') return T.cond[v] || v;
    if (field === 'category_id') return ctx.categories.get(v) || T.empty;
    if (field === 'weight_unit_id') return ctx.units.get(v) || T.empty;
    if (typeof v === 'number') return num(v);
    return String(v);
  };

  const groups = new Map();
  for (const e of items) {
    const u = e.user || {};
    const key = e.txn || `${u.id ?? e.user_id ?? '?'}|${String(e.at || '').slice(0, 19)}`;
    if (!groups.has(key)) groups.set(key, { key, at: e.at, user: u.name || u.userid || '', rows: [] });
    groups.get(key).rows.push(e);
  }

  return [...groups.values()].map((g) => {
    const lines = []; // {topic, text}
    const push = (topic, text) => lines.push({ topic, text });
    let created = false, deleted = false;
    const buckets = new Map(); // table|action -> rows, collapsed when large
    for (const e of g.rows) {
      const k = `${e.table_name}|${String(e.action).toLowerCase()}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(e);
    }
    for (const [k, rows] of buckets) {
      const [table, act0] = k.split('|');
      const act = act0 === 'insert' ? 'create' : act0;
      const bigN = rows.length > 3;
      const afterOf = (e) => e.after ?? parse(e.after_json) ?? {};
      const beforeOf = (e) => e.before ?? parse(e.before_json) ?? {};
      const changesOf = (e) => (e.changes?.length ? e.changes.map((c) => ({ field: c.field, from: c.from, to: c.to }))
        : Object.keys({ ...beforeOf(e), ...afterOf(e) }).filter((f) => JSON.stringify(beforeOf(e)[f]) !== JSON.stringify(afterOf(e)[f])).map((f) => ({ field: f, from: beforeOf(e)[f], to: afterOf(e)[f] })));

      if (table === 'products') {
        if (act === 'create') created = true;
        else if (act === 'delete') deleted = true;
        else for (const e of rows) for (const c of changesOf(e)) {
          if (!T.field[c.field]) continue;
          if (c.field === 'description') push('product', fill(T.line.textChanged, { f: T.field.description }));
          else push('product', fill(T.line.changeNoVar, { f: T.field[c.field], a: fmt(c.field, c.from), b: fmt(c.field, c.to) }));
        }
      } else if (table === 'product_variants') {
        if (act === 'create') {
          if (bigN) push('variant', fill(T.line.variantN, { n: rows.length }));
          else rows.forEach((e) => push('variant', fill(T.line.variantNew, { v: vOf(e.record_id, afterOf(e)) || T.someVariant })));
        } else if (act === 'delete') {
          if (bigN) push('variant', fill(T.line.variantDelN, { n: rows.length }));
          else rows.forEach((e) => push('variant', fill(T.line.variantDel, { v: vOf(e.record_id, beforeOf(e)) || T.someVariant })));
        } else {
          const merged = new Map();
          for (const e of rows) for (const c of changesOf(e)) {
            if (!T.field[c.field] || ['name', 'description'].includes(c.field)) continue;
            const topic = c.field === 'price' ? 'price' : 'variant';
            const text = fill(T.line.change, { f: T.field[c.field], v: forVar(vOf(e.record_id, beforeOf(e))), a: fmt(c.field, c.from), b: fmt(c.field, c.to) });
            merged.set(topic + text, { topic, text });
          }
          merged.forEach((l) => push(l.topic, l.text));
        }
      } else if (table === 'wholesale_tiers') {
        for (const e of rows.slice(0, bigN ? 0 : 3)) {
          const a = afterOf(e), b = beforeOf(e), v = forVar(vOf((act === 'delete' ? b : a).variant_id));
          if (act === 'create') push('wholesale', fill(T.line.wsNew, { v, q: a.min_qty, p: rupiah(a.price) }));
          else if (act === 'delete') push('wholesale', fill(T.line.wsDel, { v, q: b.min_qty }));
          else { const c = changesOf(e).find((x) => x.field === 'price'); if (c) push('wholesale', fill(T.line.wsChg, { v, q: a.min_qty ?? b.min_qty, a: fmt('price', c.from), b: fmt('price', c.to) })); }
        }
        if (bigN) push('wholesale', fill(act === 'delete' ? T.line.wsDelN : T.line.wsNewN, { n: rows.length }));
      } else if (table === 'discounts') {
        if (act === 'update') rows.forEach((e) => push('discount', fill(T.line.discChg, { v: forVar(vOf(afterOf(e).variant_id)) })));
        else if (bigN || (rows.length > 1 && rows.every((e) => (e.after ?? e.before)?.batch_id === (rows[0].after ?? rows[0].before)?.batch_id))) {
          const ps = rows.map((e) => (act === 'create' ? afterOf(e) : beforeOf(e)).price).filter((p) => p != null);
          const range = ps.length ? (Math.min(...ps) === Math.max(...ps) ? rupiah(ps[0]) : `${rupiah(Math.min(...ps))} - ${rupiah(Math.max(...ps))}`) : '';
          push('discount', act === 'create' ? fill(T.line.discNewN, { n: rows.length, p: range }) : fill(T.line.discDelN, { n: rows.length }));
        } else rows.forEach((e) => {
          const a = act === 'create' ? afterOf(e) : beforeOf(e), v = forVar(vOf(a.variant_id));
          if (act === 'create') push('discount', fill(T.line.discNew, { p: rupiah(a.price), v, from: fmtWib(a.starts_at, ctx.lang), to: fmtWib(a.ends_at, ctx.lang) }));
          else push('discount', fill(T.line.discDel, { v, p: rupiah(a.price) }));
        });
      } else if (table === 'product_images') {
        if (act === 'update') { if (rows.some((e) => afterOf(e).is_cover === 1 && beforeOf(e).is_cover !== 1)) push('photo', T.line.photoCover); }
        else if (bigN) push('photo', fill(act === 'delete' ? T.line.photoDelN : T.line.photoNewN, { n: rows.length }));
        else rows.forEach(() => push('photo', act === 'delete' ? T.line.photoDel : T.line.photoNew));
      } else if (table === 'product_tags') {
        rows.forEach((e) => { const tg = (act === 'delete' ? beforeOf(e) : afterOf(e)).tag; if (tg) push('tag', fill(act === 'delete' ? T.line.tagDel : T.line.tagNew, { t: tg })); });
      } else if (table === 'product_axes' || table === 'axis_options') {
        const opt = table === 'axis_options', key = opt ? 'value' : 'name';
        rows.forEach((e) => {
          const a = afterOf(e), b = beforeOf(e);
          if (act === 'create') push('axis', fill(opt ? T.line.optNew : T.line.axisNew, { t: a[key] }));
          else if (act === 'delete') push('axis', fill(opt ? T.line.optDel : T.line.axisDel, { t: b[key] }));
          else if (a[key] !== b[key]) push('axis', fill(opt ? T.line.optRen : T.line.axisRen, { a: b[key], b: a[key] }));
        });
      } else if (table === 'stock_movements') {
        if (bigN) push('stock', fill(T.line.stockN, { n: rows.length }));
        else rows.forEach((e) => {
          const a = afterOf(e), q = Number(a.qty_change);
          push('stock', fill(T.line.stock, { v: forVar(vOf(a.variant_id)), q: (q > 0 ? '+' : '') + num(q), r: a.reason ? ` (${reasonText(a.reason)})` : '' }));
        });
      }
      // variant_options and anything else: internal, intentionally not shown
    }

    const seen = new Set();
    const uniq = lines.filter((l) => !seen.has(l.text) && seen.add(l.text));
    const topics = [...new Set(uniq.map((l) => T.topic[l.topic] || T.topic.other))];
    let summary;
    if (created) summary = T.created;
    else if (deleted) summary = T.deleted;
    else if (topics.length) summary = `${T.changed}: ${topics.slice(0, 3).join(', ')}${topics.length > 3 ? ' ' + fill(T.more, { n: topics.length - 3 }) : ''}`;
    else summary = T.noDetail;
    return { key: g.key, at: g.at, user: g.user || T.unknownUser, summary, lines: uniq, created, deleted };
  });
}

export const auditText = (lang) => L[lang] || L.id;
