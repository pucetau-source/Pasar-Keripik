// Regression tests for QA findings: zero prices, text limits, /uploads traversal,
// friendly discount-overlap times, grouped/readable audit, bilingual stock reasons.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, simpleProduct } from './helpers.js';
import { formatWib, formatWibRange } from '../lib/time.js';

let s;
let cat;
before(async () => {
  s = await startServer();
  cat = (await s.api('POST', '/categories', { name: 'QA Fix' })).data;
});
after(async () => { await s.close(); });

const one = (extra = {}) => ({ option_values: [], price: 10000, weight_value: 100, weight_unit_id: s.unit('g'), ...extra });

test('price 0 is rejected for variants, wholesale and discounts (friendly id/en)', async () => {
  const zero = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { variants: [one({ price: 0 })] }), { lang: 'id' });
  assert.equal(zero.status, 422);
  assert.equal(zero.data.error.fields['variants[0].price'], 'Harga minimal Rp1.');
  const zeroEn = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { variants: [one({ price: '0' })] }));
  assert.equal(zeroEn.data.error.fields['variants[0].price'], 'Price must be at least Rp1.');
  const tier = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    variants: [one({ wholesale: [{ min_qty: 5, price: 0 }] })],
  }));
  assert.equal(tier.data.error.fields['variants[0].wholesale[0].price'], 'Price must be at least Rp1.');
  const neg = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { variants: [one({ price: -5 })] }));
  assert.equal(neg.data.error.fields['variants[0].price'], 'Price must be at least Rp1.');
  const okOne = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { variants: [one({ price: 1 })] }));
  assert.equal(okOne.status, 201, JSON.stringify(okOne.data));

  const p = (await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g')))).data;
  const when = { starts_at: '2030-01-01 10:00', ends_at: '2030-01-02 10:00' };
  const d0 = await s.api('POST', `/products/${p.id}/discounts`, { ...when, price: 0 }, { lang: 'id' });
  assert.equal(d0.status, 422);
  assert.equal(d0.data.error.fields.price, 'Harga minimal Rp1.');
  const d0i = await s.api('POST', `/products/${p.id}/discounts`, { ...when, items: [{ variant_id: p.variants[0].id, price: 0 }] });
  assert.equal(d0i.data.error.fields['items[0].price'], 'Price must be at least Rp1.');
  // percent rounding down to Rp0 is rejected too
  const cheap = okOne.data;
  const pct = await s.api('POST', `/products/${cheap.id}/discounts`, { ...when, percent: 99 });
  assert.equal(pct.status, 422);
  assert.match(pct.data.error.fields.percent, /at least Rp1/);
});

test('text limits mirror the UI maxLength values', async () => {
  const long = (n) => 'x'.repeat(n);
  const ok = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { name: long(120) }));
  assert.equal(ok.status, 201);
  const bad = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { name: long(121) }), { lang: 'id' });
  assert.equal(bad.status, 422);
  assert.equal(bad.data.error.fields.name, 'Maksimal 120 karakter.');
  const desc = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { description: long(3001) }));
  assert.equal(desc.data.error.fields.description, 'At most 3000 characters.');
  const sku = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { variants: [one({ sku: long(61), barcode: long(41) })] }));
  assert.ok(sku.data.error.fields['variants[0].sku']);
  assert.ok(sku.data.error.fields['variants[0].barcode']);
  const ax = await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), {
    axes: [{ name: long(41), options: [long(41)] }], variants: [one({ option_values: [long(41)] })],
  }));
  assert.ok(ax.data.error.fields['axes[0].name']);
  assert.ok(ax.data.error.fields['axes[0].options[0]']);
  const c = await s.api('POST', '/categories', { name: long(81) });
  assert.equal(c.data.error.fields.name, 'At most 80 characters.');
  const u = await s.api('POST', '/units', { name: 'satuan panjang', symbol: long(9), to_base: 1 });
  assert.equal(u.data.error.fields.symbol, 'At most 8 characters.');
  const v = ok.data.variants[0].id;
  const note = await s.api('POST', `/variants/${v}/stock`, { qty_change: 1, reason: long(80), note: long(201) });
  assert.equal(note.data.error.fields.note, 'At most 200 characters.');
  assert.equal(note.data.error.fields.reason, undefined);
});

test('/uploads traversal and malformed paths give 404 JSON, never 500', async () => {
  for (const u of ['/uploads/..%2f..%2fserver%2fconfig.js', '/uploads/..%5c..%5cserver%5cconfig.js', '/uploads/%E0%A4%A', '/uploads/nope.webp']) {
    const r = await fetch(s.origin + u);
    const body = await r.text();
    assert.equal(r.status, 404, u);
    assert.doesNotMatch(body, /at |Error|config/, u);
    assert.equal(JSON.parse(body).error.code, 'NOT_FOUND');
  }
  const bad = await s.api('GET', '/products/%E0%A4%A');
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error.code, 'BAD_REQUEST');
});

test('WIB formatting helpers', () => {
  assert.equal(formatWib('2026-10-24 21:55:00', 'id'), '24 Okt 2026 21.55');
  assert.equal(formatWib('2026-10-24 21:55:00', 'en'), 'Oct 24, 2026 21:55');
  assert.equal(formatWibRange('2026-10-24 21:55:00', '2026-10-25 08:00:00', 'id'), '24 Okt 2026 21.55 - 25 Okt 2026 08.00 WIB');
  assert.equal(formatWib('2026-05-01 07:05:00', 'id', { suffix: true }), '1 Mei 2026 07.05 WIB');
});

test('discount overlap message shows a friendly WIB range (id/en)', async () => {
  const p = (await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g')))).data;
  const first = await s.api('POST', `/products/${p.id}/discounts`, { starts_at: '2030-10-24 21:55', ends_at: '2030-10-25 08:00', price: 9000 });
  assert.equal(first.status, 201);
  const clashId = await s.api('POST', `/products/${p.id}/discounts`, { starts_at: '2030-10-25 07:00', ends_at: '2030-10-26 08:00', price: 8000 }, { lang: 'id' });
  assert.equal(clashId.status, 409);
  assert.match(clashId.data.error.message, /\(24 Okt 2030 21\.55 - 25 Okt 2030 08\.00 WIB\)/);
  assert.doesNotMatch(clashId.data.error.message, /2030-10/);
  const clashEn = await s.api('POST', `/products/${p.id}/discounts`, { starts_at: '2030-10-25 07:00', ends_at: '2030-10-26 08:00', price: 8000 });
  assert.match(clashEn.data.error.message, /\(Oct 24, 2030 21:55 - Oct 25, 2030 08:00 WIB\)/);
  assert.match(Object.values(clashEn.data.error.fields)[0], /Oct 24, 2030 21:55/);
});

test('audit is grouped per save with readable, translated changes; raw rows via ?raw=1', async () => {
  const created = await s.api('POST', '/products', {
    name: 'Audit Keripik', category_id: cat.id, tags: ['pedas'],
    axes: [{ name: 'Rasa', options: ['Pedas', 'Original'] }],
    variants: [
      { option_values: ['Pedas'], sku: 'AUD-P', price: 12000, stock: 5, weight_value: 100, weight_unit_id: s.unit('g') },
      { option_values: ['Original'], sku: 'AUD-O', price: 11000, weight_value: 100, weight_unit_id: s.unit('g') },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const p = created.data;
  const vP = p.variants.find((x) => x.sku === 'AUD-P');
  // one save: name + price of one variant
  const upd = await s.api('PUT', `/products/${p.id}`, {
    name: 'Audit Keripik Baru', axes: p.axes,
    variants: p.variants.map((x) => (x.id === vP.id ? { ...x, price: 10000 } : x)),
  });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  await s.api('POST', `/variants/${vP.id}/stock`, { qty_change: 3, reason: 'restock' });
  await s.api('POST', `/products/${p.id}/discounts`, { starts_at: '2030-10-24 21:55', ends_at: '2030-10-25 08:00', variant_ids: [vP.id], price: 9000 });

  const id = (await s.api('GET', `/products/${p.id}/audit`, null, { lang: 'id' })).data;
  assert.equal(id.total, 4);
  assert.deepEqual(id.items.map((g) => g.action), ['discount_added', 'stock_changed', 'updated', 'created']);
  const [disc, stockG, updG, createG] = id.items;
  assert.equal(updG.summary, 'Produk diubah');
  assert.match(updG.at_text, /^\d{1,2} \w{3} \d{4} \d{2}\.\d{2} WIB$/);
  assert.equal(updG.user.userid, 'admin1');
  const texts = updG.changes.map((c) => c.text);
  assert.ok(texts.includes('Nama: Audit Keripik → Audit Keripik Baru'), texts.join(' | '));
  assert.ok(texts.includes('Pedas (AUD-P) · Harga: Rp 12.000 → Rp 10.000'), texts.join(' | '));
  const price = updG.changes.find((c) => c.field === 'price');
  assert.deepEqual([price.entity, price.kind, price.variant, price.label, price.from, price.to],
    ['variant', 'changed', 'Pedas (AUD-P)', 'Harga', 'Rp 12.000', 'Rp 10.000']);
  assert.ok(updG.entry_ids.length >= 2);
  assert.equal(stockG.summary, 'Stok diubah');
  assert.deepEqual(stockG.changes.map((c) => c.text), ['Pedas (AUD-P) · Stok: +3 (Tambah stok)']);
  assert.equal(disc.changes[0].text, 'Pedas (AUD-P) · Diskon ditambahkan: Rp 9.000, 24 Okt 2030 21.55 - 25 Okt 2030 08.00 WIB');
  const ctexts = createG.changes.map((c) => c.text);
  assert.equal(createG.summary, 'Produk dibuat');
  assert.ok(ctexts.includes('Produk dibuat: Audit Keripik'));
  assert.ok(ctexts.includes('Variasi ditambahkan: Rasa (Pedas, Original)'), ctexts.join(' | '));
  assert.ok(ctexts.includes('Varian ditambahkan: Pedas (AUD-P) (Rp 12.000)'), ctexts.join(' | '));
  assert.ok(ctexts.includes('Pedas (AUD-P) · Stok: +5 (Stok awal)'), ctexts.join(' | '));
  assert.ok(ctexts.includes('Tag ditambahkan: pedas'));
  assert.ok(!ctexts.some((t) => /variant_options|_id\b/.test(t)));

  const en = (await s.api('GET', `/products/${p.id}/audit`)).data;
  assert.equal(en.items[2].summary, 'Product updated');
  assert.ok(en.items[2].changes.some((c) => c.text === 'Pedas (AUD-P) · Price: Rp 12.000 → Rp 10.000'));
  assert.equal(en.items[1].changes[0].text, 'Pedas (AUD-P) · Stock: +3 (Restock)');
  assert.match(en.items[0].at_text, /^\w{3} \d{1,2}, \d{4} \d{2}:\d{2} WIB$/);
  assert.ok(en.items[3].changes.some((c) => c.text === 'Pedas (AUD-P) · Stock: +5 (Initial stock)'));

  const paged = (await s.api('GET', `/products/${p.id}/audit?page=2&page_size=1`)).data;
  assert.equal(paged.total, 4);
  assert.equal(paged.items.length, 1);
  assert.equal(paged.items[0].action, 'stock_changed');

  const raw = (await s.api('GET', `/products/${p.id}/audit?raw=1`)).data;
  assert.ok(raw.total > 4);
  assert.ok(raw.items.every((r) => 'table_name' in r && 'before' in r && 'after' in r));
});

test('stock reasons are available in id and en; initial is translated', async () => {
  const id = (await s.api('GET', '/settings', null, { lang: 'id' })).data;
  assert.ok(Array.isArray(id.stock_reasons) && id.stock_reasons.includes('restock'));
  assert.deepEqual(id.stock_reason_options.find((o) => o.value === 'restock'), { value: 'restock', label: 'Tambah stok' });
  assert.deepEqual(id.stock_reason_labels.initial, { id: 'Stok awal', en: 'Initial stock' });
  assert.deepEqual(id.stock_reason_labels.stock_opname, { id: 'Stok opname', en: 'Stock count' });
  const en = (await s.api('GET', '/settings')).data;
  assert.equal(en.stock_reason_options.find((o) => o.value === 'damaged').label, 'Damaged');
  // derived keys are ignored when a client PUTs the whole settings object back
  const put = await s.api('PUT', '/settings', en);
  assert.equal(put.status, 200, JSON.stringify(put.data));

  const p = (await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g'), { variants: [one({ stock: 4 })] }))).data;
  await s.api('POST', `/variants/${p.variants[0].id}/stock`, { qty_change: 1, reason: 'alasan sendiri' });
  const mv = (await s.api('GET', `/variants/${p.variants[0].id}/stock-movements`, null, { lang: 'id' })).data.items;
  assert.deepEqual(mv.map((m) => m.reason_label), ['alasan sendiri', 'Stok awal']);
  const mvEn = (await s.api('GET', `/variants/${p.variants[0].id}/stock-movements`)).data.items;
  assert.equal(mvEn[1].reason_label, 'Initial stock');
});
