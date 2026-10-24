import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, simpleProduct } from './helpers.js';

let s;
let cat;
before(async () => {
  s = await startServer();
  cat = (await s.api('POST', '/categories', { name: 'Fitur' })).data;
});
after(async () => { await s.close(); });

const png = (w, h, color = '#c8742a') => sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();
function logoForm(buf, type, name = 'logo.png') {
  const fd = new FormData();
  fd.append('logo', new Blob([buf], { type }), name);
  return fd;
}
const settingsAudits = () => s.db.prepare(`SELECT COUNT(*) FROM audit_log WHERE table_name = 'settings' AND action = 'update'`).pluck().get();

test('settings: tagline, low_stock_threshold, logo_file seeded and editable', async () => {
  const g = (await s.api('GET', '/settings')).data;
  assert.equal(g.tagline, 'Renyahnya, selalu bikin happy');
  assert.equal(g.low_stock_threshold, 10);
  assert.equal(g.logo_file, null);
  assert.equal(g.logo_url, null);

  const n = settingsAudits();
  const put = await s.api('PUT', '/settings', { tagline: 'Kriuk!', low_stock_threshold: '5' });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal(put.data.tagline, 'Kriuk!');
  assert.equal(put.data.low_stock_threshold, 5);
  assert.equal(settingsAudits(), n + 2);

  const bad = await s.api('PUT', '/settings', { low_stock_threshold: -1 });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.low_stock_threshold);
  const notInt = await s.api('PUT', '/settings', { low_stock_threshold: 2.5 });
  assert.equal(notInt.status, 422);
  const badLogo = await s.api('PUT', '/settings', { logo_file: '../evil.webp' });
  assert.equal(badLogo.status, 422);
  assert.ok(badLogo.data.error.fields.logo_file);
  // whole object round-trip still fine (logo_url derived, logo_file null)
  const round = await s.api('PUT', '/settings', put.data);
  assert.equal(round.status, 200, JSON.stringify(round.data));
  await s.api('PUT', '/settings', { low_stock_threshold: 10, tagline: 'Renyahnya, selalu bikin happy' });
});

test('logo upload: resized webp, replaces previous file, delete restores default', async () => {
  const n = settingsAudits();
  const r1 = await s.api('POST', '/settings/logo', logoForm(await png(1000, 500), 'image/png'));
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.match(r1.data.logo_file, /^logo-.+\.webp$/);
  assert.equal(r1.data.logo_url, `/uploads/${r1.data.logo_file}`);
  const img = Buffer.from(await (await fetch(s.origin + r1.data.logo_url)).arrayBuffer());
  const meta = await sharp(img).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 256);
  assert.equal(meta.height, 128);
  const file1 = path.join(s.cfg.uploadDir, r1.data.logo_file);
  assert.ok(fs.existsSync(file1));

  const r2 = await s.api('POST', '/settings/logo', logoForm(await png(100, 100), 'image/png'));
  assert.equal(r2.status, 200);
  assert.notEqual(r2.data.logo_file, r1.data.logo_file);
  assert.ok(!fs.existsSync(file1), 'previous logo file removed');
  // read via a buffer: sharp's file cache would keep the file locked on Windows
  assert.equal((await sharp(fs.readFileSync(path.join(s.cfg.uploadDir, r2.data.logo_file))).metadata()).width, 100, 'no enlargement');
  assert.equal((await s.api('GET', '/settings')).data.logo_url, r2.data.logo_url);

  const d = await s.api('DELETE', '/settings/logo');
  assert.equal(d.status, 200);
  assert.equal(d.data.logo_file, null);
  assert.equal(d.data.logo_url, null);
  assert.ok(!fs.existsSync(path.join(s.cfg.uploadDir, r2.data.logo_file)));
  assert.equal(settingsAudits(), n + 3);
  assert.equal((await s.api('DELETE', '/settings/logo')).status, 200, 'idempotent');
});

test('logo upload rejects SVG (even disguised), > 2 MB, unreadable, missing', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>');
  const a = await s.api('POST', '/settings/logo', logoForm(svg, 'image/svg+xml', 'x.svg'));
  assert.equal(a.status, 415);
  assert.equal(a.data.error.code, 'IMAGE_TYPE');
  const b = await s.api('POST', '/settings/logo', logoForm(svg, 'image/png', 'x.png'));
  assert.equal(b.status, 415, 'SVG content with a PNG mime type is still rejected');

  const noise = await sharp(Buffer.from(Array.from({ length: 1100 * 1100 * 3 }, () => Math.floor(Math.random() * 256))), {
    raw: { width: 1100, height: 1100, channels: 3 },
  }).png().toBuffer();
  assert.ok(noise.length > 2 * 1024 * 1024);
  const c = await s.api('POST', '/settings/logo', logoForm(noise, 'image/png'));
  assert.equal(c.status, 413);
  assert.equal(c.data.error.code, 'IMAGE_TOO_LARGE');
  assert.match(c.data.error.message, /2 MB/);

  const d = await s.api('POST', '/settings/logo', logoForm(Buffer.from('nope'), 'image/jpeg', 'x.jpg'));
  assert.equal(d.status, 422);
  assert.equal(d.data.error.code, 'IMAGE_UNREADABLE');
  const e = await s.api('POST', '/settings/logo', new FormData());
  assert.equal(e.status, 422);
  assert.equal((await s.api('GET', '/settings')).data.logo_file, null);
});

test('stats + list low_stock follow the threshold and active variants', async () => {
  const before = (await s.api('GET', '/stats')).data;
  const v = (extra) => ({ price: 10000, weight_value: 100, weight_unit_id: s.unit('g'), ...extra });
  const multi = (stocks, extra = {}) => ({
    ...simpleProduct(cat.id, s.unit('g')),
    axes: [{ name: 'Rasa', options: stocks.map((_, i) => `R${i}`) }],
    variants: stocks.map(([stock, active], i) => v({ option_values: [`R${i}`], stock, active })),
    ...extra,
  });
  const low = (await s.api('POST', '/products', multi([[50, true], [3, true]]))).data;
  const ok = (await s.api('POST', '/products', multi([[50, true], [0, false]]), {})).data; // low variant inactive
  const inactive = (await s.api('POST', '/products', multi([[10, true]], { status: 'inactive' }))).data; // == threshold
  const gone = (await s.api('POST', '/products', multi([[0, true]]))).data;
  await s.api('DELETE', `/products/${gone.id}`);

  const st = (await s.api('GET', '/stats')).data;
  assert.deepEqual(Object.keys(st).sort(), ['active_products', 'inactive_products', 'low_stock_products', 'total_products']);
  assert.equal(st.total_products, before.total_products + 3);
  assert.equal(st.active_products, before.active_products + 2);
  assert.equal(st.inactive_products, before.inactive_products + 1);
  assert.equal(st.low_stock_products, before.low_stock_products + 2);

  const items = (await s.api('GET', '/products?page_size=100')).data.items;
  const flag = (p) => items.find((i) => i.id === p.id).low_stock;
  assert.equal(flag(low), true);
  assert.equal(flag(ok), false);
  assert.equal(flag(inactive), true);
  assert.ok(!('stock_min' in items[0]));

  // restock -> no longer low; threshold change applies immediately
  await s.api('POST', `/variants/${low.variants[1].id}/stock`, { qty_change: 20, reason: 'restock' });
  assert.equal((await s.api('GET', '/stats')).data.low_stock_products, before.low_stock_products + 1);
  await s.api('PUT', '/settings', { low_stock_threshold: 0 });
  const zero = s.db.prepare('SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND stock_min = 0').pluck().get();
  assert.equal((await s.api('GET', '/stats')).data.low_stock_products, zero);
  assert.equal(flag(inactive), true); // (old list snapshot)
  assert.equal((await s.api('GET', '/products?page_size=100')).data.items.find((i) => i.id === inactive.id).low_stock, false);
  await s.api('PUT', '/settings', { low_stock_threshold: 10 });

  const plan = s.db.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*), SUM(status = 'active'), SUM(stock_min <= 10)
    FROM products INDEXED BY idx_products_status_stock WHERE deleted_at IS NULL`).all().map((r) => r.detail).join(' ');
  assert.match(plan, /COVERING INDEX idx_products_status_stock/);
});

test('duplicate copies structure, tiers, tags, images; new SKUs, no barcodes, stock 0, inactive', async () => {
  const unit = s.unit('g');
  const src = (await s.api('POST', '/products', {
    name: 'K'.repeat(115), category_id: cat.id, description: 'Asli', min_purchase: 2, tags: ['pedas', 'renyah'],
    axes: [{ name: 'Rasa', options: ['Pedas', 'Original'] }, { name: 'Ukuran', options: ['100 g', '250 g'] }],
    variants: [
      { option_values: ['Pedas', '100 g'], price: 10000, stock: 7, barcode: '899000001', weight_value: 100, weight_unit_id: unit,
        wholesale: [{ min_qty: 10, price: 9000 }, { min_qty: 20, price: 8500 }] },
      { option_values: ['Original', '250 g'], price: 20000, stock: 3, barcode: '899000002', weight_value: 250, weight_unit_id: unit, active: false },
    ],
  })).data;
  const fd = new FormData();
  fd.append('images', new Blob([await png(50, 50)], { type: 'image/png' }), 'a.png');
  fd.append('images', new Blob([await png(60, 60, '#ffffff')], { type: 'image/png' }), 'b.png');
  const imgs = (await s.api('POST', `/products/${src.id}/images`, fd)).data;
  await s.api('PUT', `/images/${imgs[1].id}`, { variant_id: src.variants[1].id, is_cover: true });
  const disc = await s.api('POST', `/products/${src.id}/discounts`, {
    starts_at: '2020-01-01 00:00', ends_at: '2099-01-01 00:00', price: 5000, variant_ids: [src.variants[0].id] });
  assert.equal(disc.status, 201, JSON.stringify(disc.data));

  const r = await s.api('POST', `/products/${src.id}/duplicate`, null, { lang: 'id' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const c = r.data;
  assert.notEqual(c.id, src.id);
  assert.equal(c.name.length, 120);
  assert.ok(c.name.endsWith(' (salinan)'));
  assert.equal(c.status, 'inactive');
  assert.equal(c.category_id, cat.id);
  assert.equal(c.description, 'Asli');
  assert.equal(c.min_purchase, 2);
  assert.deepEqual(c.tags, ['pedas', 'renyah']);
  assert.deepEqual(c.axes.map((a) => [a.name, a.options.map((o) => o.value)]), [['Rasa', ['Pedas', 'Original']], ['Ukuran', ['100 g', '250 g']]]);
  assert.deepEqual(c.variants.map((x) => x.option_values), [['Pedas', '100 g'], ['Original', '250 g']]);
  assert.deepEqual(c.variants.map((x) => [x.price, x.stock, x.barcode, x.active, x.weight_grams]), [[10000, 0, null, true, 100], [20000, 0, null, false, 250]]);
  assert.deepEqual(c.variants[0].wholesale.map(({ min_qty, price }) => [min_qty, price]), [[10, 9000], [20, 8500]]);
  const skus = new Set([...src.variants, ...c.variants].map((x) => x.sku.toLowerCase()));
  assert.equal(skus.size, 4, 'fresh unique SKUs');
  assert.equal(c.stock_total, 0);
  assert.deepEqual(c.discounts, []);
  assert.equal(c.variants[0].effective_price, 10000);
  assert.equal(c.images.length, 2);
  assert.deepEqual(c.images.map((i) => i.is_cover), [false, true]);
  assert.equal(c.images[1].variant_id, c.variants[1].id, 'image variant link remapped');
  for (const im of c.images) {
    assert.ok(!src.images?.some((x) => x.url === im.url));
    assert.equal((await fetch(s.origin + im.url)).status, 200);
    assert.equal((await fetch(s.origin + im.thumb_url)).status, 200);
  }
  assert.ok(!imgs.some((i) => c.images.some((x) => x.url === i.url)), 'files are copies');
  assert.equal(s.db.prepare('SELECT COUNT(*) FROM stock_movements sm JOIN product_variants pv ON pv.id = sm.variant_id WHERE pv.product_id = ?').pluck().get(c.id), 0);

  const audit = (await s.api('GET', `/products/${c.id}/audit`)).data;
  assert.equal(audit.total, 1);
  assert.equal(audit.items[0].action, 'created');

  const en = await s.api('POST', `/products/${c.id}/duplicate`);
  assert.equal(en.status, 201);
  assert.ok(en.data.name.endsWith(' (copy)'));
  assert.equal(en.data.name.length, 120);

  const short = (await s.api('POST', '/products', simpleProduct(cat.id, unit, { name: 'Keripik Pisang' }))).data;
  assert.equal((await s.api('POST', `/products/${short.id}/duplicate`)).data.name, 'Keripik Pisang (copy)');

  assert.equal((await s.api('POST', '/products/999999/duplicate')).status, 404);
  await s.api('DELETE', `/products/${short.id}`);
  assert.equal((await s.api('POST', `/products/${short.id}/duplicate`)).status, 404);
});
