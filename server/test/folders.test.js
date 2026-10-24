import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, simpleProduct } from './helpers.js';
import { slugify, safeRel, absPath, syncFolders } from '../services/folders.js';
import { openDb } from '../db/index.js';
import { Writer } from '../lib/writer.js';
import { createCategory } from '../services/categories.js';
import { createProduct } from '../services/products.js';

let s;
before(async () => { s = await startServer(); });
after(async () => { await s.close(); });

const png = (color = '#c8742a') => sharp({ create: { width: 40, height: 30, channels: 3, background: color } }).png().toBuffer();
const dirExists = (rel) => fs.statSync(path.join(s.cfg.uploadDir, ...rel.split('/')), { throwIfNoEntry: false })?.isDirectory() === true;
const fileExists = (rel) => fs.existsSync(path.join(s.cfg.uploadDir, ...rel.split('/')));
const cat = async (name, parentId = null) => {
  const r = await s.api('POST', '/categories', { name, parent_id: parentId });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
};
async function upload(productId, n = 1) {
  const fd = new FormData();
  for (let i = 0; i < n; i++) fd.append('images', new Blob([await png()], { type: 'image/png' }), `p${i}.png`);
  const r = await s.api('POST', `/products/${productId}/images`, fd);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
const imgRows = (productId) => s.db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY id').all(productId);
const get = async (url) => (await fetch(s.origin + url)).status;

test('slugify + path safety', () => {
  assert.equal(slugify('Keripik Pisang'), 'keripik-pisang');
  assert.equal(slugify('  Kue  Kering!! (Lebaran) '), 'kue-kering-lebaran');
  assert.equal(slugify('Café Crème'), 'cafe-creme');
  assert.equal(slugify('../../etc'), 'etc');
  assert.equal(slugify('ケーキ'), '');
  for (const bad of ['../x', 'a/../b', '/abs', 'C:/x', 'a\\b', '', 'a//b', './a']) {
    assert.throws(() => safeRel(bad), /internal/, bad);
  }
  assert.throws(() => absPath(s.cfg.uploadDir, '../outside'));
  assert.equal(safeRel('keripik/keripik-pisang/x.webp'), 'keripik/keripik-pisang/x.webp');
});

test('nested categories create folders; sibling slug collisions get -2, -3; empty slug -> category-<id>', async () => {
  const root = await cat('Keripik');
  const child = await cat('Keripik Pisang', root.id);
  const grand = await cat('Pedas Manis', child.id);
  assert.equal(root.folder, 'keripik');
  assert.equal(child.folder, 'keripik/keripik-pisang');
  assert.equal(grand.folder, 'keripik/keripik-pisang/pedas-manis');
  assert.ok(dirExists('keripik/keripik-pisang/pedas-manis'));

  const twin = await cat('Keripik-Pisang', root.id);
  const triple = await cat('keripik pisang!', root.id);
  assert.equal(twin.folder, 'keripik/keripik-pisang-2');
  assert.equal(triple.folder, 'keripik/keripik-pisang-3');
  assert.ok(dirExists('keripik/keripik-pisang-2') && dirExists('keripik/keripik-pisang-3'));

  const odd = await cat('ケーキ');
  assert.equal(odd.folder, `category-${odd.id}`);
  assert.ok(dirExists(odd.folder));
  const reserved = await cat('CON');
  assert.equal(reserved.folder, 'con-2', 'Windows device names are avoided');

  const flat = (await s.api('GET', '/categories?flat=1')).data;
  assert.equal(flat.find((c) => c.id === grand.id).folder, 'keripik/keripik-pisang/pedas-manis');
});

test('upload stores files in the category folder; rename parent moves files, DB paths and URLs', async () => {
  const root = await cat('Kerupuk');
  const leaf = await cat('Kerupuk Udang', root.id);
  const prod = (await s.api('POST', '/products', simpleProduct(leaf.id, s.unit('g')))).data;
  const imgs = await upload(prod.id, 2);
  const rows = imgRows(prod.id);
  for (const r of rows) {
    assert.match(r.file, /^kerupuk\/kerupuk-udang\/[0-9a-f-]{36}\.webp$/);
    assert.match(r.thumb, /^kerupuk\/kerupuk-udang\/[0-9a-f-]{36}\.thumb\.webp$/);
    assert.ok(fileExists(r.file) && fileExists(r.thumb));
  }
  assert.equal(imgs[0].url, `/uploads/${rows[0].file}`);
  assert.equal(imgs[0].thumb_url, `/uploads/${rows[0].thumb}`);
  assert.equal(await get(imgs[0].url), 200);
  // a folder URL is never listed / redirected
  assert.equal(await get('/uploads/kerupuk/kerupuk-udang'), 404);
  assert.equal(await get('/uploads/kerupuk/kerupuk-udang/'), 404);

  // soft-deleted photo: file stays and moves along with the folder
  assert.equal((await s.api('DELETE', `/images/${imgs[1].id}`)).status, 204);

  const r = await s.api('PUT', `/categories/${root.id}`, { name: 'Kerupuk Renyah' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.folder, 'kerupuk-renyah');
  assert.ok(!dirExists('kerupuk'));
  assert.ok(dirExists('kerupuk-renyah/kerupuk-udang'));
  assert.equal(s.db.prepare('SELECT folder FROM categories WHERE id = ?').pluck().get(leaf.id), 'kerupuk-renyah/kerupuk-udang');
  const moved = imgRows(prod.id);
  for (const m of moved) {
    assert.ok(m.file.startsWith('kerupuk-renyah/kerupuk-udang/'), m.file);
    assert.ok(m.thumb.startsWith('kerupuk-renyah/kerupuk-udang/'), m.thumb);
    assert.ok(fileExists(m.file) && fileExists(m.thumb));
  }
  assert.equal(await get(imgs[0].url), 404, 'old URL is gone');
  assert.equal(await get(imgs[0].thumb_url), 404);
  const detail = (await s.api('GET', `/products/${prod.id}`)).data;
  assert.equal(detail.images[0].url, `/uploads/${moved[0].file}`);
  assert.equal(await get(detail.images[0].url), 200);
  assert.equal(await get(detail.images[0].thumb_url), 200);
  const list = (await s.api('GET', `/products?category_id=${root.id}`)).data.items[0];
  assert.equal(list.cover_thumb_url, `/uploads/${moved[0].thumb}`);

  // rename that keeps the same slug: no folder change
  const same = await s.api('PUT', `/categories/${root.id}`, { name: 'kerupuk renyah!' });
  assert.equal(same.status, 200);
  assert.equal(same.data.folder, 'kerupuk-renyah');
});

test('move a category under another parent (with descendants)', async () => {
  const a = await cat('Makanan Ringan');
  const b = await cat('Basreng', a.id);
  const c = await cat('Basreng Pedas', b.id);
  const dest = await cat('Camilan');
  const prod = (await s.api('POST', '/products', simpleProduct(c.id, s.unit('g')))).data;
  await upload(prod.id);
  const before = imgRows(prod.id)[0];
  assert.ok(before.file.startsWith('makanan-ringan/basreng/basreng-pedas/'));

  const r = await s.api('PUT', `/categories/${b.id}`, { parent_id: dest.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.folder, 'camilan/basreng');
  assert.equal(s.db.prepare('SELECT folder FROM categories WHERE id = ?').pluck().get(c.id), 'camilan/basreng/basreng-pedas');
  assert.ok(!dirExists('makanan-ringan/basreng'));
  const after = imgRows(prod.id)[0];
  assert.equal(after.file, before.file.replace('makanan-ringan/basreng/', 'camilan/basreng/'));
  assert.ok(fileExists(after.file) && fileExists(after.thumb));
  assert.ok(!fileExists(before.file));

  // move to root where the slug is already taken by another root category -> -2
  const clash = await cat('Basreng');
  void clash;
  const r2 = await s.api('PUT', `/categories/${b.id}`, { parent_id: null });
  assert.equal(r2.status, 422, 'same name at root is still rejected by the name rule');
  const r3 = await s.api('PUT', `/categories/${b.id}`, { parent_id: null, name: 'Basreng!' });
  assert.equal(r3.status, 200, JSON.stringify(r3.data));
  assert.equal(r3.data.folder, 'basreng-2');
  assert.ok(fileExists(imgRows(prod.id)[0].file));

  // audit: the category rows record the folder change
  const audit = s.db.prepare(`SELECT after_json FROM audit_log WHERE table_name = 'categories' AND record_id = ? AND action = 'update' ORDER BY id DESC LIMIT 1`).pluck().get(c.id);
  assert.equal(JSON.parse(audit).folder, 'basreng-2/basreng-pedas');
});

test('changing a product category moves its images (incl. thumbs) and updates DB paths', async () => {
  const x = await cat('Kue Kering');
  const y = await cat('Nastar', x.id);
  const prod = (await s.api('POST', '/products', simpleProduct(x.id, s.unit('g')))).data;
  const imgs = await upload(prod.id, 2);
  const r = await s.api('PUT', `/products/${prod.id}`, { category_id: y.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  for (const im of imgRows(prod.id)) {
    assert.ok(im.file.startsWith('kue-kering/nastar/') && im.thumb.startsWith('kue-kering/nastar/'), im.file);
    assert.ok(fileExists(im.file) && fileExists(im.thumb));
  }
  assert.equal(await get(imgs[0].url), 404);
  assert.equal(await get(r.data.images[0].url), 200);

  // duplicate copies into the same category folder
  const dup = await s.api('POST', `/products/${prod.id}/duplicate`);
  assert.equal(dup.status, 201);
  const drows = imgRows(dup.data.id);
  assert.equal(drows.length, 2);
  for (const d of drows) {
    assert.ok(d.file.startsWith('kue-kering/nastar/') && fileExists(d.file) && fileExists(d.thumb));
    assert.ok(!imgRows(prod.id).some((o) => o.file === d.file), 'fresh file names');
  }

  // a validation error after the move plan rolls back everything (no files moved)
  const before = imgRows(prod.id);
  const bad = await s.api('PUT', `/products/${prod.id}`, { category_id: x.id, name: '' });
  assert.equal(bad.status, 422);
  assert.deepEqual(imgRows(prod.id).map((i) => i.file), before.map((i) => i.file));
  assert.ok(before.every((i) => fileExists(i.file)));
});

test('a failing file move rolls back the category rename and returns a friendly error', async () => {
  const k = await cat('Kacang');
  const prod = (await s.api('POST', '/products', simpleProduct(k.id, s.unit('g')))).data;
  await upload(prod.id);
  const before = imgRows(prod.id)[0];
  // occupy the target folder name on disk with a plain file -> rename target is "taken" -> -2 is used
  fs.writeFileSync(path.join(s.cfg.uploadDir, 'kacang-goreng'), 'x');
  const r = await s.api('PUT', `/categories/${k.id}`, { name: 'Kacang Goreng' });
  assert.equal(r.status, 200);
  assert.equal(r.data.folder, 'kacang-goreng-2', 'existing disk entries are never overwritten');

  // simulate a folder locked by another program (Windows EBUSY on every retry)
  const folder = r.data.folder;
  const orig = fs.renameSync;
  fs.renameSync = () => { const e = new Error('busy'); e.code = 'EBUSY'; throw e; };
  let res;
  try {
    res = await s.api('PUT', `/categories/${k.id}`, { name: 'Kacang Mete' }, { lang: 'id' });
  } finally {
    fs.renameSync = orig;
  }
  assert.equal(res.status, 409, JSON.stringify(res.data));
  assert.equal(res.data.error.code, 'FOLDER_BUSY');
  assert.match(res.data.error.message, /Tidak ada yang diubah/);
  const row = s.db.prepare('SELECT name, folder FROM categories WHERE id = ?').get(k.id);
  assert.deepEqual(row, { name: 'Kacang Goreng', folder });
  const now = imgRows(prod.id)[0];
  assert.equal(now.file, before.file.replace('kacang/', 'kacang-goreng-2/'));
  assert.ok(fileExists(now.file));
  assert.ok(!dirExists('kacang-mete'));
});

test('deleting a category renames its folder to -unused (files kept); same name gets a fresh folder', async () => {
  const p = await cat('Seblak');
  const c = await cat('Seblak Kering', p.id);
  const prod = (await s.api('POST', '/products', simpleProduct(c.id, s.unit('g')))).data;
  await upload(prod.id);
  const file = imgRows(prod.id)[0].file;
  assert.equal((await s.api('DELETE', `/products/${prod.id}`)).status, 204);
  assert.equal((await s.api('DELETE', `/categories/${c.id}`)).status, 204);
  const row = s.db.prepare('SELECT folder, deleted_at FROM categories WHERE id = ?').get(c.id);
  assert.ok(row.deleted_at);
  assert.equal(row.folder, 'seblak/seblak-kering-unused');
  assert.ok(!dirExists('seblak/seblak-kering') && dirExists('seblak/seblak-kering-unused'));
  const moved = imgRows(prod.id)[0];
  assert.equal(moved.file, file.replace('seblak-kering/', 'seblak-kering-unused/'));
  assert.ok(fileExists(moved.file), 'files are never deleted');
  // the delete audit row carries the folder change
  const audit = s.db.prepare(`SELECT before_json, after_json FROM audit_log WHERE table_name = 'categories' AND record_id = ? AND action = 'delete'`).get(c.id);
  assert.equal(JSON.parse(audit.before_json).folder, 'seblak/seblak-kering');
  assert.equal(JSON.parse(audit.after_json).folder, 'seblak/seblak-kering-unused');

  const again = await cat('Seblak Kering', p.id);
  assert.equal(again.folder, 'seblak/seblak-kering');
  assert.ok(dirExists('seblak/seblak-kering'));
  assert.equal((await s.api('DELETE', `/categories/${again.id}`)).status, 204);
  assert.equal(s.db.prepare('SELECT folder FROM categories WHERE id = ?').pluck().get(again.id), 'seblak/seblak-kering-unused-2');
  assert.ok(dirExists('seblak/seblak-kering-unused-2'));

  // renaming the parent carries the deleted children's folders + old photos along
  const r = await s.api('PUT', `/categories/${p.id}`, { name: 'Seblak Kerupuk' });
  assert.equal(r.status, 200);
  assert.equal(s.db.prepare('SELECT folder FROM categories WHERE id = ?').pluck().get(c.id), 'seblak-kerupuk/seblak-kering-unused');
  assert.ok(fileExists(imgRows(prod.id)[0].file));
});

test('startup backfill: folders for existing categories and root images moved in (idempotent)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-fold-'));
  const uploadDir = path.join(dir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const db = openDb(path.join(dir, 't.db'));
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const w = new Writer(db, user);
    const g = db.prepare(`SELECT id FROM units WHERE symbol = 'g'`).pluck().get();
    const root = createCategory(w, { name: 'Keripik' });
    const leaf = createCategory(w, { name: 'Keripik Tempe', parent_id: root.id });
    // simulate pre-004 data: no folder, image file in the upload root
    db.prepare('UPDATE categories SET folder = NULL').run();
    const prod = createProduct(w, simpleProduct(leaf.id, g));
    fs.writeFileSync(path.join(uploadDir, 'p1-old.webp'), 'main');
    fs.writeFileSync(path.join(uploadDir, 'p1-old-t.webp'), 'thumb');
    db.prepare(`INSERT INTO product_images (product_id, file, thumb, position, is_cover) VALUES (?, 'p1-old.webp', 'p1-old-t.webp', 0, 1)`).run(prod.id);

    const first = syncFolders(db, uploadDir);
    assert.equal(first.moved, 1);
    assert.deepEqual(db.prepare('SELECT folder FROM categories ORDER BY id').pluck().all(), ['keripik', 'keripik/keripik-tempe']);
    const im = db.prepare('SELECT file, thumb FROM product_images').get();
    assert.deepEqual(im, { file: 'keripik/keripik-tempe/p1-old.webp', thumb: 'keripik/keripik-tempe/p1-old-t.webp' });
    assert.equal(fs.readFileSync(path.join(uploadDir, 'keripik', 'keripik-tempe', 'p1-old.webp'), 'utf8'), 'main');
    assert.ok(!fs.existsSync(path.join(uploadDir, 'p1-old.webp')));

    const second = syncFolders(db, uploadDir);
    assert.equal(second.moved, 0, 'idempotent');
    assert.deepEqual(db.prepare('SELECT file, thumb FROM product_images').get(), im);
  } finally {
    db.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows */ }
  }
});

test('shop logo stays in the upload root', async () => {
  const fd = new FormData();
  fd.append('logo', new Blob([await png()], { type: 'image/png' }), 'logo.png');
  const r = await s.api('POST', '/settings/logo', fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(!r.data.logo_file.includes('/'));
  assert.ok(fileExists(r.data.logo_file));
});

test('GET /products?low_stock=1 uses the same rule as /stats and the list flag', async () => {
  const lc = await cat('Stok Test');
  const g = s.unit('g');
  const mk = async (stock, extra = {}) => (await s.api('POST', '/products', simpleProduct(lc.id, g, {
    variants: [{ option_values: [], price: 10000, stock, weight_value: 100, weight_unit_id: g }], ...extra,
  }))).data;
  const low = await mk(3);
  const ok = await mk(50);
  const lowInactive = await mk(0, { status: 'inactive' });
  const all = (await s.api('GET', `/products?category_id=${lc.id}&page_size=100`)).data.items;
  assert.equal(all.length, 3);
  const r = await s.api('GET', `/products?category_id=${lc.id}&low_stock=1&page_size=100`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items.map((i) => i.id).sort(), [low.id, lowInactive.id].sort());
  assert.ok(r.data.items.every((i) => i.low_stock === true));
  assert.equal(r.data.total, 2);
  const act = (await s.api('GET', `/products?category_id=${lc.id}&low_stock=1&status=active`)).data;
  assert.deepEqual(act.items.map((i) => i.id), [low.id]);
  const off = (await s.api('GET', `/products?category_id=${lc.id}&low_stock=0`)).data;
  assert.equal(off.total, 3);
  void ok;

  // global: count matches /stats
  const stats = (await s.api('GET', '/stats')).data;
  const glob = (await s.api('GET', '/products?low_stock=1&page_size=1')).data;
  assert.equal(glob.total, stats.low_stock_products);
  const listed = (await s.api('GET', '/products?page_size=100')).data;
  assert.equal(listed.items.filter((i) => i.low_stock).length, stats.low_stock_products);

  const bad = await s.api('GET', '/products?low_stock=maybe');
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.low_stock);

  const plan = s.db.prepare(
    `EXPLAIN QUERY PLAN SELECT COUNT(*) FROM products p WHERE p.deleted_at IS NULL AND p.status IN ('active', 'inactive') AND p.stock_min <= ?`
  ).all(10).map((x) => x.detail).join(' | ');
  assert.match(plan, /idx_products_status_stock/);
});
