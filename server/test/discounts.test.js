import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { nowWib, wibFromNow, normalizeWib } from '../lib/time.js';

let s;
let product;
before(async () => {
  s = await startServer();
  const cat = (await s.api('POST', '/categories', { name: 'Diskon' })).data;
  product = (await s.api('POST', '/products', {
    name: 'Keripik Diskon', category_id: cat.id,
    axes: [{ name: 'Rasa', options: ['Pedas', 'Original'] }],
    variants: [
      { option_values: ['Pedas'], price: 20000, weight_value: 200, weight_unit_id: s.unit('g') },
      { option_values: ['Original'], price: 10000, weight_value: 200, weight_unit_id: s.unit('g') },
    ],
  })).data;
});
after(async () => { await s.close(); });

const vid = (name) => product.variants.find((v) => v.option_values[0] === name).id;

test('WIB time helpers', () => {
  assert.match(nowWib(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  // Fixed instant: 2026-01-01T00:00:00Z is 07:00 WIB
  assert.equal(nowWib(new Date('2026-01-01T00:00:00Z')), '2026-01-01 07:00:00');
  assert.equal(normalizeWib('2026-02-03T04:05'), '2026-02-03 04:05:00');
  assert.equal(normalizeWib('2026-02-30 10:00'), null);
  assert.equal(process.env.TZ, 'Asia/Jakarta');
  // SQLite WIB clock agrees with JS WIB clock
  const sqlNow = s.db.prepare(`SELECT datetime('now','+7 hours')`).pluck().get();
  const diff = Math.abs(new Date(sqlNow.replace(' ', 'T') + 'Z') - new Date(nowWib().replace(' ', 'T') + 'Z'));
  assert.ok(diff < 5000, `sqlite vs js WIB drift ${diff}ms`);
});

test('product-wide discount: one row per variant, shared batch_id; percent mode', async () => {
  const r = await s.api('POST', `/products/${product.id}/discounts`, {
    starts_at: wibFromNow(60 * 24), ends_at: wibFromNow(60 * 48), percent: 10,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.discounts.length, 2);
  assert.ok(r.data.discounts.every((d) => d.batch_id === r.data.batch_id));
  const prices = Object.fromEntries(r.data.discounts.map((d) => [d.variant_id, d.price]));
  assert.equal(prices[vid('Pedas')], 18000);
  assert.equal(prices[vid('Original')], 9000);
  // scheduled, not active yet
  const d = await s.api('GET', `/products/${product.id}`);
  assert.ok(d.data.discounts.every((x) => x.state === 'scheduled'));
  assert.equal(d.data.variants[0].effective_price, d.data.variants[0].price);
  // remove the batch
  const del = await s.api('DELETE', `/discounts/${r.data.discounts[0].id}?batch=1`);
  assert.equal(del.status, 200);
  assert.equal(del.data.deleted.length, 2);
});

test('discount rules: lower price, start<end, not ended, no overlap per variant, adjacent ok', async () => {
  const P = vid('Pedas');
  const base = { starts_at: wibFromNow(60 * 72), ends_at: wibFromNow(60 * 96) };
  const notLower = await s.api('POST', `/products/${product.id}/discounts`, { ...base, items: [{ variant_id: P, price: 20000 }] });
  assert.equal(notLower.status, 422);
  assert.match(notLower.data.error.fields['items[0].price'], /lower than the normal price/);

  const range = await s.api('POST', `/products/${product.id}/discounts`, { starts_at: base.ends_at, ends_at: base.starts_at, price: 5000 });
  assert.equal(range.status, 422);
  assert.ok(range.data.error.fields.ends_at);

  const ended = await s.api('POST', `/products/${product.id}/discounts`, { starts_at: wibFromNow(-120), ends_at: wibFromNow(-60), price: 5000 });
  assert.equal(ended.status, 422);

  const badFmt = await s.api('POST', `/products/${product.id}/discounts`, { starts_at: '24/10/2026', ends_at: base.ends_at, price: 5000 }, { lang: 'id' });
  assert.equal(badFmt.status, 422);
  assert.match(badFmt.data.error.fields.starts_at, /WIB/);

  const both = await s.api('POST', `/products/${product.id}/discounts`, { ...base, price: 5000, percent: 5 });
  assert.equal(both.status, 422);

  const first = await s.api('POST', `/products/${product.id}/discounts`, { ...base, items: [{ variant_id: P, price: 15000 }] });
  assert.equal(first.status, 201);
  // overlapping period for same variant -> 409
  const overlap = await s.api('POST', `/products/${product.id}/discounts`, {
    starts_at: wibFromNow(60 * 80), ends_at: wibFromNow(60 * 120), items: [{ variant_id: P, price: 14000 }],
  });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.data.error.code, 'DISCOUNT_OVERLAP');
  // same period, other variant -> fine
  const other = await s.api('POST', `/products/${product.id}/discounts`, { ...base, variant_ids: [vid('Original')], price: 8000 });
  assert.equal(other.status, 201);
  // adjacent (starts exactly when previous ends) -> fine; several scheduled ahead allowed
  const adj = await s.api('POST', `/products/${product.id}/discounts`, {
    starts_at: base.ends_at, ends_at: wibFromNow(60 * 120), items: [{ variant_id: P, price: 16000 }],
  });
  assert.equal(adj.status, 201, JSON.stringify(adj.data));
  // DB trigger is the safety net
  assert.throws(() => s.db.prepare(
    `INSERT INTO discounts (variant_id, price, starts_at, ends_at) VALUES (?, 100, ?, ?)`
  ).run(P, wibFromNow(60 * 73), wibFromNow(60 * 74)), /DISCOUNT_OVERLAP/);

  // variant price cannot drop to/below a scheduled discount
  const cur = (await s.api('GET', `/products/${product.id}`)).data;
  const lower = await s.api('PUT', `/products/${product.id}`, {
    axes: cur.axes, variants: cur.variants.map((v) => (v.id === P ? { ...v, price: 15000 } : v)),
  });
  assert.equal(lower.status, 422);
  assert.ok(Object.values(lower.data.error.fields)[0].includes('16.000') || Object.values(lower.data.error.fields)[0].includes('16,000'));
});

test('effective price uses WIB now (active discount; UTC-shifted period is not active)', async () => {
  const cat = (await s.api('POST', '/categories', { name: 'Efektif' })).data;
  const p = (await s.api('POST', '/products', {
    name: 'Efektif', category_id: cat.id, axes: [],
    variants: [{ option_values: [], price: 10000, weight_value: 100, weight_unit_id: s.unit('g') }],
  })).data;
  const v = p.variants[0].id;
  // Active now in WIB.
  const r = await s.api('POST', `/products/${p.id}/discounts`, { starts_at: wibFromNow(-1), ends_at: wibFromNow(30), price: 7500 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const d = (await s.api('GET', `/products/${p.id}`)).data;
  assert.equal(d.variants[0].effective_price, 7500);
  assert.equal(d.variants[0].active_discount.price, 7500);
  assert.equal(d.discounts[0].state, 'active');
  const list = (await s.api('GET', `/products?q=Efektif`)).data.items[0];
  assert.equal(list.has_discount, true);
  assert.equal(list.effective_price_min, 7500);
  assert.equal(list.price_min, 10000);

  // A period written as if "now" were UTC (7h behind WIB) must NOT be active.
  await s.api('DELETE', `/discounts/${r.data.discounts[0].id}`);
  const utcNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const utcPlus30 = new Date(Date.now() + 30 * 60000).toISOString().slice(0, 19).replace('T', ' ');
  s.db.prepare('INSERT INTO discounts (variant_id, price, starts_at, ends_at) VALUES (?, 5000, ?, ?)').run(v, utcNow, utcPlus30);
  const vp = s.db.prepare('SELECT effective_price, discount_id FROM v_variant_price WHERE variant_id = ?').get(v);
  assert.equal(vp.discount_id, null);
  assert.equal(vp.effective_price, 10000);
  // and one starting 1 minute from now (WIB) is not active yet
  s.db.prepare('INSERT INTO discounts (variant_id, price, starts_at, ends_at) VALUES (?, 6000, ?, ?)').run(v, wibFromNow(1), wibFromNow(60));
  assert.equal(s.db.prepare('SELECT effective_price FROM v_variant_price WHERE variant_id = ?').pluck().get(v), 10000);
});
