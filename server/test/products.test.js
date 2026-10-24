import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, simpleProduct } from './helpers.js';

let s;
let cat;
before(async () => {
  s = await startServer();
  cat = (await s.api('POST', '/categories', { name: 'Produk Test' })).data;
});
after(async () => { await s.close(); });

const variant = (values, extra = {}) => ({ option_values: values, price: 20000, weight_value: 250, weight_unit_id: s.unit('g'), ...extra });

test('GET /me returns the seeded phase-1 user', async () => {
  const r = await s.api('GET', '/me');
  assert.equal(r.status, 200);
  assert.equal(r.data.userid, 'admin1');
  assert.equal(r.data.name, 'admin pasar keripik');
});

test('unit conversion: weight_grams computed from unit.to_base', async () => {
  const r = await s.api('POST', '/products', {
    name: 'Berat test', category_id: cat.id,
    axes: [{ name: 'Ukuran', options: ['Kecil', 'Besar', 'Mini'] }],
    variants: [
      variant(['Kecil'], { weight_value: 250, weight_unit_id: s.unit('g') }),
      variant(['Besar'], { weight_value: 1.5, weight_unit_id: s.unit('kg') }),
      variant(['Mini'], { weight_value: 500, weight_unit_id: s.unit('mg') }),
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const g = Object.fromEntries(r.data.variants.map((v) => [v.option_values[0], v.weight_grams]));
  assert.equal(g.Kecil, 250);
  assert.equal(g.Besar, 1500);
  assert.equal(g.Mini, 0.5);

  // Changing a unit's to_base recomputes weights of variants using it.
  const ons = await s.api('POST', '/units', { name: 'ons', symbol: 'ons', to_base: 100 });
  assert.equal(ons.status, 201);
  const upd = await s.api('PUT', `/products/${r.data.id}`, {
    axes: r.data.axes, variants: r.data.variants.map((v) => ({ ...v, weight_value: 2, weight_unit_id: ons.data.id })),
  });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  assert.ok(upd.data.variants.every((v) => v.weight_grams === 200));
  await s.api('PUT', `/units/${ons.data.id}`, { to_base: 113.4 });
  const d = await s.api('GET', `/products/${r.data.id}`);
  assert.ok(d.data.variants.every((v) => v.weight_grams === 226.8));

  // unit in use cannot be deleted; unused can
  const del = await s.api('DELETE', `/units/${ons.data.id}`);
  assert.equal(del.status, 409);
  assert.equal(del.data.error.code, 'UNIT_IN_USE');
  const tmp = await s.api('POST', '/units', { name: 'pon', symbol: 'lb', to_base: 453.6 });
  assert.equal((await s.api('DELETE', `/units/${tmp.data.id}`)).status, 204);
  const dupSym = await s.api('POST', '/units', { name: 'gramm', symbol: 'G', to_base: 1 });
  assert.equal(dupSym.status, 422);
  const badBase = await s.api('POST', '/units', { name: 'x', symbol: 'x', to_base: 0 });
  assert.equal(badBase.status, 422);
  assert.ok(badBase.data.error.fields.to_base);
});

test('variants: 3 axes full combination, combos unique, max 3 axes', async () => {
  const axes = [
    { name: 'Rasa', options: ['Pedas', 'Original'] },
    { name: 'Ukuran', options: ['100g', '250g'] },
    { name: 'Kemasan', options: ['Pouch', 'Toples'] },
  ];
  const variants = [];
  for (const a of axes[0].options) for (const b of axes[1].options) for (const c of axes[2].options) variants.push(variant([a, b, c]));
  const r = await s.api('POST', '/products', { name: 'Tiga variasi', category_id: cat.id, axes, variants });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.variants.length, 8);
  assert.equal(r.data.axes.length, 3);
  assert.deepEqual(r.data.variants[7].option_values, ['Original', '250g', 'Toples']);
  assert.equal(new Set(r.data.variants.map((v) => v.sku)).size, 8, 'auto SKUs are unique');

  const four = await s.api('POST', '/products', {
    name: 'Empat', category_id: cat.id, axes: [...axes, { name: 'Warna', options: ['Merah'] }], variants,
  });
  assert.equal(four.status, 422);
  assert.ok(four.data.error.fields.axes);

  const dupCombo = await s.api('POST', '/products', {
    name: 'Dup', category_id: cat.id, axes: [axes[0]], variants: [variant(['Pedas']), variant(['pedas'])],
  });
  assert.equal(dupCombo.status, 422);
  assert.ok(dupCombo.data.error.fields['variants[1].option_values']);

  const unknown = await s.api('POST', '/products', {
    name: 'Unknown', category_id: cat.id, axes: [axes[0]], variants: [variant(['Manis'])],
  });
  assert.equal(unknown.status, 422);
  assert.match(unknown.data.error.fields['variants[0].option_values'], /Manis/);

  const noAxesTwo = await s.api('POST', '/products', {
    name: 'NoAxes', category_id: cat.id, axes: [], variants: [variant([]), variant([])],
  });
  assert.equal(noAxesTwo.status, 422);
  assert.ok(noAxesTwo.data.error.fields.variants);

  const wrongCount = await s.api('POST', '/products', {
    name: 'Wrong', category_id: cat.id, axes: axes.slice(0, 2), variants: [variant(['Pedas'])],
  });
  assert.equal(wrongCount.status, 422);
});

test('update keeps matched variants (stock), soft-deletes removed ones, adds new', async () => {
  const r = await s.api('POST', '/products', {
    name: 'Update test', category_id: cat.id,
    axes: [{ name: 'Rasa', options: ['Pedas', 'Original'] }],
    variants: [variant(['Pedas'], { stock: 7, sku: 'UPD-P' }), variant(['Original'], { stock: 3, sku: 'UPD-O' })],
  });
  assert.equal(r.status, 201);
  const pedas = r.data.variants.find((v) => v.sku === 'UPD-P');
  const upd = await s.api('PUT', `/products/${r.data.id}`, {
    axes: [{ name: 'Rasa', options: ['Pedas', 'Keju'] }],
    variants: [variant(['Pedas'], { price: 21000, sku: 'UPD-P', stock: 999 }), variant(['Keju'], { sku: 'UPD-K', stock: 4 })],
  });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  const p2 = upd.data.variants.find((v) => v.sku === 'UPD-P');
  assert.equal(p2.id, pedas.id, 'same variant row kept');
  assert.equal(p2.stock, 7, 'stock is not changed by product PUT');
  assert.equal(p2.price, 21000);
  const keju = upd.data.variants.find((v) => v.sku === 'UPD-K');
  assert.equal(keju.stock, 4, 'new variant gets initial stock movement');
  assert.equal(upd.data.variants.length, 2);
  assert.equal(upd.data.stock_total, 11);
  const removed = s.db.prepare(`SELECT deleted_at FROM product_variants WHERE sku = 'UPD-O'`).get();
  assert.ok(removed.deleted_at, 'removed variant is soft deleted');

  // SKU reuse across products is blocked; SKU of soft-deleted variant can be reused
  const taken = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    variants: [{ option_values: [], sku: 'upd-p', price: 1000, weight_value: 1, weight_unit_id: s.unit('g') }],
  }));
  assert.equal(taken.status, 422);
  assert.match(taken.data.error.fields['variants[0].sku'], /already used/);
  const reuse = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    variants: [{ option_values: [], sku: 'UPD-O', barcode: '899000111', price: 1000, weight_value: 1, weight_unit_id: s.unit('g') }],
  }));
  assert.equal(reuse.status, 201);
  const bc = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    variants: [{ option_values: [], barcode: '899000111', price: 1000, weight_value: 1, weight_unit_id: s.unit('g') }],
  }));
  assert.equal(bc.status, 422);
  assert.ok(bc.data.error.fields['variants[0].barcode']);

  // partial update of scalars only
  const st = await s.api('PUT', `/products/${r.data.id}`, { status: 'inactive' });
  assert.equal(st.status, 200);
  assert.equal(st.data.status, 'inactive');
  assert.equal(st.data.variants.length, 2);
  const half = await s.api('PUT', `/products/${r.data.id}`, { variants: [] });
  assert.equal(half.status, 422);
});

test('wholesale rules: price below variant price, qty increasing, price decreasing', async () => {
  const mk = (wholesale, extra = {}) => s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    variants: [{ option_values: [], price: 10000, weight_value: 100, weight_unit_id: s.unit('g'), wholesale }], ...extra,
  }));
  const ok = await mk([{ min_qty: 5, price: 9500 }, { min_qty: 10, price: 9000 }, { min_qty: 50, price: 8000 }]);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.variants[0].wholesale.map((t) => [t.min_qty, t.price]), [[5, 9500], [10, 9000], [50, 8000]]);

  const notLower = await mk([{ min_qty: 5, price: 10000 }]);
  assert.equal(notLower.status, 422);
  assert.match(notLower.data.error.fields['variants[0].wholesale[0].price'], /lower than the normal price/);

  const qtyNotUp = await mk([{ min_qty: 10, price: 9000 }, { min_qty: 10, price: 8000 }]);
  assert.equal(qtyNotUp.status, 422);
  assert.ok(qtyNotUp.data.error.fields['variants[0].wholesale[1].min_qty']);

  const priceNotDown = await mk([{ min_qty: 5, price: 9000 }, { min_qty: 10, price: 9000 }]);
  assert.equal(priceNotDown.status, 422);
  assert.match(priceNotDown.data.error.fields['variants[0].wholesale[1].price'], /lower price/);

  const belowMinPurchase = await mk([{ min_qty: 3, price: 9000 }], { min_purchase: 3 });
  assert.equal(belowMinPurchase.status, 422);
  assert.ok(belowMinPurchase.data.error.fields['variants[0].wholesale[0].min_qty']);

  // update tiers: change one, drop one
  const v0 = ok.data.variants[0];
  const upd = await s.api('PUT', `/products/${ok.data.id}`, {
    axes: [], variants: [{ ...v0, wholesale: [{ min_qty: 5, price: 9400 }, { min_qty: 10, price: 9000 }] }],
  });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  assert.deepEqual(upd.data.variants[0].wholesale.map((t) => [t.min_qty, t.price]), [[5, 9400], [10, 9000]]);
  const deleted = s.db.prepare('SELECT COUNT(*) FROM wholesale_tiers WHERE variant_id = ? AND deleted_at IS NOT NULL').pluck().get(v0.id);
  assert.equal(deleted, 1);
});

test('product validation: preorder days, condition, status, category', async () => {
  const r = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    preorder: true, condition: 'bekas', status: 'x', category_id: 99999, min_purchase: 0,
  }), { lang: 'id' });
  assert.equal(r.status, 422);
  const f = r.data.error.fields;
  assert.equal(f.preorder_days, 'Isi lama pre-order (hari).');
  assert.match(f.condition, /Pilih salah satu/);
  assert.ok(f.status && f.category_id && f.min_purchase);
  const bad = await fetch(`${s.origin}/api/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'BAD_JSON');
});

test('list: search by name/tag/sku, paging, sort, status filter', async () => {
  const c2 = (await s.api('POST', '/categories', { name: 'Cari' })).data;
  for (let i = 0; i < 5; i++) {
    await s.api('POST', '/products', simpleProduct(c2.id, s.unit('g'), {
      name: `Basreng Level ${i}`, tags: i === 0 ? ['Gurih Banget'] : [],
      variants: [{ option_values: [], price: 1000 * (i + 1), sku: `BAS-${i}`, weight_value: 100, weight_unit_id: s.unit('g') }],
      status: i === 4 ? 'inactive' : 'active',
    }));
  }
  const all = await s.api('GET', `/products?category_id=${c2.id}&page_size=2&sort=price_desc`);
  assert.equal(all.data.total, 5);
  assert.equal(all.data.items.length, 2);
  assert.equal(all.data.items[0].price_min, 5000);
  const p3 = await s.api('GET', `/products?category_id=${c2.id}&page_size=2&page=3&sort=price_desc`);
  assert.equal(p3.data.items.length, 1);
  assert.equal((await s.api('GET', '/products?q=basreng')).data.total, 5);
  assert.equal((await s.api('GET', '/products?q=gurih')).data.total, 1);
  assert.equal((await s.api('GET', '/products?q=bas-3')).data.total, 1);
  assert.equal((await s.api('GET', `/products?category_id=${c2.id}&status=inactive`)).data.total, 1);
  const tags = await s.api('GET', '/tags?q=gur');
  assert.deepEqual(tags.data.map((t) => t.tag), ['Gurih Banget']);
  const badSort = await s.api('GET', '/products?sort=zzz');
  assert.equal(badSort.status, 422);
});

test('soft delete product: hidden from list/detail, rows kept, SKU freed, hard delete blocked in DB', async () => {
  const r = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    tags: ['hapus'], variants: [{ option_values: [], sku: 'DEL-1', price: 5000, stock: 2, weight_value: 100, weight_unit_id: s.unit('g') }],
  }));
  assert.equal(r.status, 201);
  assert.equal((await s.api('DELETE', `/products/${r.data.id}`)).status, 204);
  assert.equal((await s.api('GET', `/products/${r.data.id}`)).status, 404);
  const nf = await s.api('GET', `/products/${r.data.id}`, null, { lang: 'id' });
  assert.equal(nf.data.error.message, 'Produk tidak ditemukan.');
  assert.equal((await s.api('GET', '/products?q=DEL-1')).data.total, 0);
  const row = s.db.prepare('SELECT deleted_at FROM products WHERE id = ?').get(r.data.id);
  assert.ok(row.deleted_at);
  assert.match(row.deleted_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(s.db.prepare('SELECT deleted_at FROM product_variants WHERE product_id = ?').get(r.data.id).deleted_at);
  assert.equal((await s.api('DELETE', `/products/${r.data.id}`)).status, 404);
  assert.throws(() => s.db.prepare('DELETE FROM products WHERE id = ?').run(r.data.id), /HARD_DELETE_FORBIDDEN/);
  assert.throws(() => s.db.prepare('DELETE FROM audit_log').run(), /HARD_DELETE_FORBIDDEN/);
  // audit history still available
  const audit = await s.api('GET', `/products/${r.data.id}/audit?raw=1`);
  assert.equal(audit.status, 200);
  assert.ok(audit.data.items.some((a) => a.table_name === 'products' && a.action === 'delete'));
});

test('audit rows on every write, with user and WIB time, update diff', async () => {
  const before = s.db.prepare('SELECT COUNT(*) FROM audit_log').pluck().get();
  const r = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { tags: ['a', 'b'] }));
  const afterCreate = s.db.prepare('SELECT COUNT(*) FROM audit_log').pluck().get();
  // product + variant + 2 tags = 4 rows minimum
  assert.ok(afterCreate - before >= 4);
  await s.api('PUT', `/products/${r.data.id}`, { name: 'Nama Baru' });
  const audit = await s.api('GET', `/products/${r.data.id}/audit?raw=1`);
  const last = audit.data.items[0];
  assert.equal(last.action, 'update');
  assert.equal(last.table_name, 'products');
  assert.equal(last.user.userid, 'admin1');
  assert.deepEqual(last.changes.map((c) => c.field), ['name']);
  assert.equal(last.changes[0].to, 'Nama Baru');
  assert.match(last.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  // no-op update writes no audit row
  const n1 = audit.data.total;
  await s.api('PUT', `/products/${r.data.id}`, { name: 'Nama Baru' });
  assert.equal((await s.api('GET', `/products/${r.data.id}/audit?raw=1`)).data.total, n1);
  // Every table has audit columns
  for (const t of ['users', 'settings', 'categories', 'units', 'products', 'product_axes', 'axis_options', 'product_variants',
    'variant_options', 'wholesale_tiers', 'discounts', 'product_images', 'product_tags', 'stock_movements']) {
    const cols = s.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    for (const c of ['created_by', 'created_at', 'updated_by', 'updated_at', 'deleted_at']) assert.ok(cols.includes(c), `${t}.${c}`);
  }
  // categories/units/settings writes are audited too
  const set = await s.api('PUT', '/settings', { shop_name: 'Pasar Keripik Baru' });
  assert.equal(set.status, 200);
  assert.equal(set.data.shop_name, 'Pasar Keripik Baru');
  assert.ok(s.db.prepare(`SELECT 1 FROM audit_log WHERE table_name = 'settings' AND action = 'update'`).get());
});
