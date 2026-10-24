import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, simpleProduct } from './helpers.js';

let s;
before(async () => { s = await startServer(); });
after(async () => { await s.close(); });

test('category tree: create nested, unique name per parent, case-insensitive', async () => {
  const root = await s.api('POST', '/categories', { name: 'Keripik' });
  assert.equal(root.status, 201);
  const child = await s.api('POST', '/categories', { name: 'Singkong', parent_id: root.data.id });
  assert.equal(child.status, 201);
  const grand = await s.api('POST', '/categories', { name: 'Balado', parent_id: child.data.id });
  assert.equal(grand.status, 201);

  const dup = await s.api('POST', '/categories', { name: 'singkong', parent_id: root.data.id });
  assert.equal(dup.status, 422);
  assert.equal(dup.data.error.code, 'VALIDATION');
  assert.match(dup.data.error.fields.name, /already exists/);

  // Same name under a different parent is fine.
  const other = await s.api('POST', '/categories', { name: 'Singkong' });
  assert.equal(other.status, 201);

  const tree = await s.api('GET', '/categories');
  const k = tree.data.find((c) => c.name === 'Keripik');
  assert.equal(k.children[0].name, 'Singkong');
  assert.equal(k.children[0].children[0].name, 'Balado');

  const flat = await s.api('GET', '/categories?flat=1');
  assert.ok(flat.data.find((c) => c.path === 'Keripik > Singkong > Balado' && c.depth === 2));
});

test('category: Indonesian error messages', async () => {
  const r = await s.api('POST', '/categories', { name: '' }, { lang: 'id' });
  assert.equal(r.status, 422);
  assert.equal(r.data.error.fields.name, 'Wajib diisi.');
  assert.match(r.data.error.message, /Periksa/);
});

test('category: cannot move into own descendant; reorder siblings', async () => {
  const a = (await s.api('POST', '/categories', { name: 'A-root' })).data;
  const b = (await s.api('POST', '/categories', { name: 'B', parent_id: a.id })).data;
  const c = (await s.api('POST', '/categories', { name: 'C', parent_id: b.id })).data;
  const bad = await s.api('PUT', `/categories/${a.id}`, { parent_id: c.id });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.parent_id);
  const self = await s.api('PUT', `/categories/${a.id}`, { parent_id: a.id });
  assert.equal(self.status, 422);

  const s1 = (await s.api('POST', '/categories', { name: 'S1', parent_id: a.id })).data;
  const s2 = (await s.api('POST', '/categories', { name: 'S2', parent_id: a.id })).data;
  // order now: B, S1, S2 -> move S2 to top
  const moved = await s.api('PUT', `/categories/${s2.id}`, { position: 0 });
  assert.equal(moved.status, 200);
  const flat = (await s.api('GET', '/categories?flat=1')).data.filter((x) => x.parent_id === a.id);
  assert.deepEqual(flat.map((x) => x.name), ['S2', 'B', 'S1']);
  assert.deepEqual(flat.map((x) => x.position), [0, 1, 2]);

  // move C to root and rename
  const mv = await s.api('PUT', `/categories/${c.id}`, { parent_id: null, name: 'C-root' });
  assert.equal(mv.status, 200);
  assert.equal(mv.data.parent_id, null);
  void s1;
});

test('category delete blocked with children or products; soft delete otherwise', async () => {
  const p = (await s.api('POST', '/categories', { name: 'Parent-del' })).data;
  const ch = (await s.api('POST', '/categories', { name: 'Child-del', parent_id: p.id })).data;
  const blocked = await s.api('DELETE', `/categories/${p.id}`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.error.code, 'CATEGORY_HAS_CHILDREN');
  assert.match(blocked.data.error.message, /Parent-del/);

  const prod = await s.api('POST', '/products', simpleProduct(ch.id, s.unit('g')));
  assert.equal(prod.status, 201);
  const blocked2 = await s.api('DELETE', `/categories/${ch.id}`, null, { lang: 'id' });
  assert.equal(blocked2.status, 409);
  assert.equal(blocked2.data.error.code, 'CATEGORY_HAS_PRODUCTS');
  assert.match(blocked2.data.error.message, /dipakai 1 produk/);

  // Product filter by parent includes descendants
  const list = await s.api('GET', `/products?category_id=${p.id}`);
  assert.equal(list.data.total, 1);

  assert.equal((await s.api('DELETE', `/products/${prod.data.id}`)).status, 204);
  assert.equal((await s.api('DELETE', `/categories/${ch.id}`)).status, 204);
  assert.equal((await s.api('DELETE', `/categories/${p.id}`)).status, 204);
  const row = s.db.prepare('SELECT deleted_at FROM categories WHERE id = ?').get(p.id);
  assert.ok(row.deleted_at, 'row kept with deleted_at');
  // Name is free again after soft delete
  assert.equal((await s.api('POST', '/categories', { name: 'Parent-del' })).status, 201);
  // audit rows
  const audits = s.db.prepare(`SELECT action FROM audit_log WHERE table_name = 'categories' AND record_id = ?`).pluck().all(p.id);
  assert.deepEqual(audits, ['create', 'delete']);
});
