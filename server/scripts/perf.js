// Performance check: temp DB with N demo products (default 10k), in-process server,
// then measures latency of list/detail endpoints over HTTP and prints p50/p95/p99.
//   npm run perf                      (10k products)
//   npm run perf -- --products=2000 --runs=300
import '../config.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import { seedDemo } from './seed-demo.js';

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : def;
};
const N = arg('products', 10000);
const RUNS = arg('runs', 200);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-perf-'));
const { app, db } = createApp({ dbFile: path.join(dir, 'perf.db'), uploadDir: path.join(dir, 'uploads') });
console.log(`Seeding ${N} products ...`);
const s = seedDemo(db, { products: N, log: () => {} });
db.pragma('optimize');
console.log(`  seeded in ${(s.ms / 1000).toFixed(1)}s; variants=${db.prepare('SELECT COUNT(*) FROM product_variants').pluck().get()}`);

const server = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}/api`;
const ids = db.prepare('SELECT id FROM products WHERE deleted_at IS NULL').pluck().all();
const cats = db.prepare('SELECT id FROM categories WHERE parent_id IS NULL').pluck().all();
const leaf = db.prepare('SELECT id FROM categories WHERE parent_id IS NOT NULL').pluck().all();
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

const scenarios = {
  'list default (page 1, 20)': () => '/products',
  'list deep page (page 200)': () => '/products?page=200',
  'list root category (descendants)': () => `/products?category_id=${pickOne(cats)}`,
  'list leaf category + status': () => `/products?category_id=${pickOne(leaf)}&status=active`,
  'list search q (name/tag/sku)': () => `/products?q=${pickOne(['pedas', 'balado', 'singkong', 'renyah', 'PK12'])}`,
  'list sort price_asc': () => '/products?sort=price_asc&page=3',
  'list sort stock_desc': () => '/products?sort=stock_desc',
  'list sort name_asc': () => '/products?sort=name_asc&page=10',
  'detail /products/:id': () => `/products/${pickOne(ids)}`,
  'audit grouped /products/:id/audit': () => `/products/${pickOne(ids)}/audit`,
  'categories tree': () => '/categories',
};

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const results = [];
for (const [name, url] of Object.entries(scenarios)) {
  for (let i = 0; i < 10; i++) await (await fetch(base + url())).arrayBuffer(); // warm-up
  const t = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    const res = await fetch(base + url(), { headers: { 'accept-encoding': 'gzip' } });
    await res.arrayBuffer();
    if (res.status !== 200) throw new Error(`${name}: HTTP ${res.status}`);
    t.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  t.sort((a, b) => a - b);
  results.push({ scenario: name, p50_ms: +pct(t, 50).toFixed(2), p95_ms: +pct(t, 95).toFixed(2), p99_ms: +pct(t, 99).toFixed(2), max_ms: +t[t.length - 1].toFixed(2) });
}
console.table(results);
const worst = Math.max(...results.map((r) => r.p95_ms));
console.log(`Worst p95: ${worst.toFixed(2)} ms (budget 50 ms) -> ${worst <= 50 ? 'PASS' : 'FAIL'}`);
server.close();
db.close();
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(worst <= 50 ? 0 : 1);
