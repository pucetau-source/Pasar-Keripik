import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let s;
let product;
let v;
before(async () => {
  s = await startServer();
  const cat = (await s.api('POST', '/categories', { name: 'Stok' })).data;
  product = (await s.api('POST', '/products', {
    name: 'Keripik Stok', category_id: cat.id, axes: [],
    variants: [{ option_values: [], price: 10000, stock: 10, weight_value: 100, weight_unit_id: s.unit('g') }],
  })).data;
  v = product.variants[0].id;
});
after(async () => { await s.close(); });

const insertMv = (variantId, qty, reason, source) => s.db.prepare(
  'INSERT INTO stock_movements (variant_id, qty_change, reason, source) VALUES (?, ?, ?, ?)'
).run(variantId, qty, reason, source);
const stockOf = (id) => s.db.prepare('SELECT stock FROM product_variants WHERE id = ?').pluck().get(id);

test('initial stock is recorded as a movement', async () => {
  assert.equal(stockOf(v), 10);
  const mv = s.db.prepare('SELECT * FROM stock_movements WHERE variant_id = ?').all(v);
  assert.equal(mv.length, 1);
  assert.equal(mv[0].reason, 'initial');
  assert.equal(mv[0].source, 'admin');
});

test('admin adds / subtracts / sets stock with reason; history has running balance', async () => {
  let r = await s.api('POST', `/variants/${v}/stock`, { qty_change: 5, reason: 'restock', note: 'dari supplier' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.stock, 15);
  r = await s.api('POST', `/variants/${v}/stock`, { qty_change: -3, reason: 'damaged' });
  assert.equal(r.data.stock, 12);
  r = await s.api('POST', `/variants/${v}/stock`, { set_to: 20, reason: 'stock_opname' });
  assert.equal(r.data.stock, 20);
  assert.equal(r.data.movement.qty_change, 8);
  const noReason = await s.api('POST', `/variants/${v}/stock`, { qty_change: 1 });
  assert.equal(noReason.status, 422);
  assert.ok(noReason.data.error.fields.reason);
  const zero = await s.api('POST', `/variants/${v}/stock`, { qty_change: 0, reason: 'x' });
  assert.equal(zero.status, 422);
  const h = await s.api('GET', `/variants/${v}/stock-movements`);
  assert.equal(h.status, 200);
  assert.equal(h.data.total, 4);
  assert.deepEqual(h.data.items.map((m) => m.stock_after), [20, 12, 15, 10]);
  assert.equal(h.data.items[0].created_by.userid, 'admin1');
  // list aggregate follows
  const p = (await s.api('GET', `/products/${product.id}`)).data;
  assert.equal(p.stock_total, 20);
  // audited
  assert.ok(s.db.prepare(`SELECT COUNT(*) FROM audit_log WHERE table_name = 'stock_movements' AND product_id = ?`).pluck().get(product.id) >= 4);
});

test('stock never below 0 (API and DB trigger)', async () => {
  const cur = stockOf(v);
  const r = await s.api('POST', `/variants/${v}/stock`, { qty_change: -(cur + 1), reason: 'damaged' }, { lang: 'id' });
  assert.equal(r.status, 409);
  assert.equal(r.data.error.message, 'Stok tidak boleh kurang dari 0.');
  assert.throws(() => insertMv(v, -(cur + 1), 'adjustment', 'admin'), /STOCK_NEGATIVE/);
  assert.throws(() => insertMv(v, -(cur + 1), 'sale', 'pos'), /STOCK_NEGATIVE/);
  const setNeg = await s.api('POST', `/variants/${v}/stock`, { set_to: -1, reason: 'x' });
  assert.equal(setNeg.status, 422);
  assert.equal(stockOf(v), cur);
});

test('pos/web can only decrease with reason sale', () => {
  const cur = stockOf(v);
  assert.throws(() => insertMv(v, 5, 'return', 'pos'), /STOCK_SOURCE_RULE/);
  assert.throws(() => insertMv(v, 5, 'sale', 'pos'), /STOCK_SOURCE_RULE/);
  assert.throws(() => insertMv(v, -1, 'adjustment', 'web'), /STOCK_SOURCE_RULE/);
  insertMv(v, -2, 'sale', 'pos');
  insertMv(v, -1, 'sale', 'web');
  assert.equal(stockOf(v), cur - 3);
  assert.throws(() => insertMv(v, 1, 'restock', 'kasir'), /STOCK_SOURCE_RULE|CHECK constraint/);
});

test('stock cannot be changed directly, movements are immutable, new variant starts at 0', () => {
  assert.throws(() => s.db.prepare('UPDATE product_variants SET stock = 999 WHERE id = ?').run(v), /STOCK_DIRECT_UPDATE/);
  const mvId = s.db.prepare('SELECT MAX(id) FROM stock_movements WHERE variant_id = ?').pluck().get(v);
  assert.throws(
    () => s.db.prepare('UPDATE product_variants SET stock = stock + 1, last_movement_id = ? WHERE id = ?').run(mvId + 1000, v),
    /STOCK_DIRECT_UPDATE/
  );
  assert.throws(() => s.db.prepare('UPDATE stock_movements SET qty_change = 100 WHERE id = ?').run(mvId), /STOCK_DIRECT_UPDATE/);
  assert.throws(() => s.db.prepare('DELETE FROM stock_movements WHERE id = ?').run(mvId), /HARD_DELETE_FORBIDDEN/);
  assert.throws(() => s.db.prepare(
    `INSERT INTO product_variants (product_id, sku, price, stock) VALUES (?, 'DIRECT-1', 1000, 5)`
  ).run(product.id), /STOCK_INITIAL_NONZERO/);
  // other columns can still be updated
  s.db.prepare('UPDATE product_variants SET barcode = ? WHERE id = ?').run('123', v);
});

test('stock endpoints 404 for unknown variant', async () => {
  const r = await s.api('POST', '/variants/999999/stock', { qty_change: 1, reason: 'x' });
  assert.equal(r.status, 404);
  assert.equal(r.data.error.code, 'NOT_FOUND');
});
