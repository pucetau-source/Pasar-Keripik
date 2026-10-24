import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startServer, simpleProduct } from './helpers.js';

let s;
let product;
before(async () => {
  s = await startServer({ maxUploadMb: 1 });
  const cat = (await s.api('POST', '/categories', { name: 'Foto' })).data;
  product = (await s.api('POST', '/products', simpleProduct(cat.id, s.unit('g')))).data;
});
after(async () => { await s.close(); });

const png = (w, h, color = '#c8742a') => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();

async function form(files, extra = {}) {
  const fd = new FormData();
  for (const [name, buf, type] of files) fd.append('images', new Blob([buf], { type }), name);
  for (const [k, val] of Object.entries(extra)) fd.append(k, String(val));
  return fd;
}

test('upload creates webp + thumbnail, first is cover, served from /uploads', async () => {
  const r = await s.api('POST', `/products/${product.id}/images`, await form([
    ['a.png', await png(2400, 1200), 'image/png'],
    ['b.png', await png(300, 300, '#ffffff'), 'image/png'],
  ]));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.length, 2);
  assert.equal(r.data[0].is_cover, true);
  assert.equal(r.data[1].is_cover, false);
  assert.equal(r.data[0].width, 1600, 'resized to max 1600px');
  const img = await fetch(s.origin + r.data[0].url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  const th = Buffer.from(await (await fetch(s.origin + r.data[0].thumb_url)).arrayBuffer());
  const meta = await sharp(th).metadata();
  assert.ok(meta.width <= 320);
  const list = (await s.api('GET', `/products?q=${encodeURIComponent(product.name)}`)).data.items[0];
  assert.equal(list.cover_thumb_url, r.data[0].thumb_url);
});

test('reorder sets cover to first; delete promotes next cover', async () => {
  const imgs = (await s.api('GET', `/products/${product.id}`)).data.images;
  const order = imgs.map((i) => i.id).reverse();
  const r = await s.api('PUT', `/products/${product.id}/images/order`, { order });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.map((i) => i.id), order);
  assert.equal(r.data[0].is_cover, true);
  const bad = await s.api('PUT', `/products/${product.id}/images/order`, { order: [order[0]] });
  assert.equal(bad.status, 422);
  assert.equal((await s.api('DELETE', `/images/${order[0]}`)).status, 204);
  const after = (await s.api('GET', `/products/${product.id}`)).data.images;
  assert.equal(after.length, 1);
  assert.equal(after[0].is_cover, true);
  assert.equal(after[0].position, 0);
  assert.ok(s.db.prepare('SELECT deleted_at FROM product_images WHERE id = ?').get(order[0]).deleted_at);
  // link to a variant
  const link = await s.api('PUT', `/images/${after[0].id}`, { variant_id: product.variants[0].id });
  assert.equal(link.status, 200);
  assert.equal(link.data.variant_id, product.variants[0].id);
});

test('rejects wrong type, too large, unreadable, too many', async () => {
  const txt = await s.api('POST', `/products/${product.id}/images`, await form([['x.txt', Buffer.from('hello'), 'text/plain']]), { lang: 'id' });
  assert.equal(txt.status, 415);
  assert.match(txt.data.error.message, /bukan gambar/);

  const noise = await sharp(Buffer.from(Array.from({ length: 900 * 900 * 3 }, () => Math.floor(Math.random() * 256))), {
    raw: { width: 900, height: 900, channels: 3 },
  }).png().toBuffer();
  assert.ok(noise.length > 1024 * 1024);
  const big = await s.api('POST', `/products/${product.id}/images`, await form([['big.png', noise, 'image/png']]));
  assert.equal(big.status, 413);
  assert.equal(big.data.error.code, 'IMAGE_TOO_LARGE');

  const fake = await s.api('POST', `/products/${product.id}/images`, await form([['fake.png', Buffer.from('not an image'), 'image/png']]));
  assert.equal(fake.status, 422);

  const empty = await s.api('POST', `/products/${product.id}/images`, new FormData());
  assert.equal(empty.status, 422);

  const files = [];
  for (let i = 0; i < 9; i++) files.push([`m${i}.png`, await png(20, 20), 'image/png']);
  const many = await s.api('POST', `/products/${product.id}/images`, await form(files));
  assert.equal(many.status, 422);
  assert.equal(many.data.error.code, 'IMAGE_TOO_MANY');
});

test('unknown routes and static', async () => {
  const r = await s.api('GET', '/nope');
  assert.equal(r.status, 404);
  assert.equal(r.data.error.code, 'NOT_FOUND');
  const u = await fetch(s.origin + '/uploads/missing.webp');
  assert.equal(u.status, 404);
  const gz = await fetch(s.origin + '/api/units', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(gz.status, 200);
});
