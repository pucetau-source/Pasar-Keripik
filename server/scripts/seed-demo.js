// Optional demo data for manual testing / performance checks. Never runs automatically.
//   npm run seed:demo                         -> 200 products into DB_FILE
//   npm run seed:demo -- --products=10000     -> 10k products
//   npm run seed:demo -- --db=data/perf.db --products=10000
// Writes go through the same services as the API (validation + audit_log).
import '../config.js';
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';
import { Writer } from '../lib/writer.js';
import { createCategory } from '../services/categories.js';
import { createProduct } from '../services/products.js';
import { createDiscounts } from '../services/discounts.js';
import { wibFromNow } from '../lib/time.js';

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const TREE = {
  Keripik: ['Keripik Singkong', 'Keripik Pisang', 'Keripik Kentang', 'Keripik Tempe', 'Keripik Talas'],
  'Kerupuk': ['Kerupuk Udang', 'Kerupuk Ikan', 'Kerupuk Kulit'],
  'Makanan Ringan': ['Basreng', 'Makaroni', 'Seblak Kering', 'Kacang'],
  'Kue Kering': ['Nastar', 'Kastengel', 'Putri Salju'],
};
const FLAVORS = ['Original', 'Pedas', 'Balado', 'Keju', 'BBQ', 'Jagung Manis', 'Rumput Laut', 'Daun Jeruk'];
const SIZES = ['100 g', '250 g', '500 g', '1 kg'];
const PACKS = ['Pouch', 'Toples'];
const TAGS = ['pedas', 'gurih', 'renyah', 'oleh-oleh', 'murah', 'premium', 'tanpa msg', 'halal', 'camilan', 'kiloan'];

let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const sample = (arr, n) => [...arr].sort(() => rnd() - 0.5).slice(0, n);

export function seedDemo(db, { products = 200, log = console.log } = {}) {
  const user = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
  const w = new Writer(db, user);
  const g = db.prepare(`SELECT id FROM units WHERE symbol = 'g' AND deleted_at IS NULL`).pluck().get();
  const kg = db.prepare(`SELECT id FROM units WHERE symbol = 'kg' AND deleted_at IS NULL`).pluck().get();

  const leafIds = [];
  for (const [root, kids] of Object.entries(TREE)) {
    let r = db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL AND deleted_at IS NULL').pluck().get(root);
    if (!r) r = createCategory(w, { name: root }).id;
    for (const k of kids) {
      let c = db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id = ? AND deleted_at IS NULL').pluck().get(k, r);
      if (!c) c = createCategory(w, { name: k, parent_id: r }).id;
      leafIds.push([c, k]);
    }
  }

  const start = Date.now();
  const existing = db.prepare('SELECT COUNT(*) FROM products').pluck().get();
  const batch = db.transaction((from, to) => {
    for (let i = from; i < to; i++) {
      const n = existing + i + 1;
      const [catId, catName] = pick(leafIds);
      const axesCount = Math.floor(rnd() * 3); // 0..2 axes (some 3)
      const axes = [];
      if (axesCount >= 1) axes.push({ name: 'Rasa', options: sample(FLAVORS, 2 + Math.floor(rnd() * 3)) });
      if (axesCount >= 2) axes.push({ name: 'Ukuran', options: sample(SIZES, 2) });
      if (axesCount >= 2 && rnd() < 0.2) axes.push({ name: 'Kemasan', options: PACKS });
      let combos = [[]];
      for (const a of axes) combos = combos.flatMap((c) => a.options.map((o) => [...c, o]));
      const base = 5000 + Math.floor(rnd() * 60) * 1000;
      const variants = combos.map((values, k) => {
        const price = base + k * 1000;
        const big = values.includes('1 kg');
        return {
          option_values: values,
          price,
          stock: Math.floor(rnd() * 200),
          barcode: rnd() < 0.5 ? `899${String(n).padStart(6, '0')}${String(k).padStart(2, '0')}` : null,
          weight_value: big ? 1 : 100 + Math.floor(rnd() * 4) * 50,
          weight_unit_id: big ? kg : g,
          wholesale: rnd() < 0.3 ? [{ min_qty: 10, price: price - 500 }, { min_qty: 50, price: price - 1000 }] : [],
        };
      });
      w.newTxn(); // one audit group per demo save
      const p = createProduct(w, {
        name: `${catName} ${pick(FLAVORS)} #${n}`,
        description: `Demo ${catName.toLowerCase()} renyah, cocok untuk camilan dan oleh-oleh.`,
        category_id: catId,
        condition: 'new',
        status: rnd() < 0.9 ? 'active' : 'inactive',
        min_purchase: 1,
        preorder: rnd() < 0.1,
        preorder_days: 3,
        length_cm: 20, width_cm: 15, height_cm: 5,
        tags: sample(TAGS, 1 + Math.floor(rnd() * 3)),
        axes,
        variants,
      });
      if (rnd() < 0.2) {
        w.newTxn();
        createDiscounts(w, p.id, { starts_at: wibFromNow(-60), ends_at: wibFromNow(60 * 24 * 7), percent: 10 });
      }
    }
  });
  const CHUNK = 500;
  for (let i = 0; i < products; i += CHUNK) {
    batch(i, Math.min(products, i + CHUNK));
    log(`  ${Math.min(products, i + CHUNK)}/${products} products`);
  }
  return { products, ms: Date.now() - start };
}

if (process.argv[1]?.endsWith('seed-demo.js')) {
  const cfg = loadConfig(arg('db') ? { dbFile: arg('db') } : {});
  const n = Number(arg('products', 200));
  console.log(`Seeding ${n} demo products into ${cfg.dbFile}`);
  const db = openDb(cfg.dbFile, { seed: { adminUserid: cfg.seedAdminUserid, adminName: cfg.seedAdminName, shopName: cfg.seedShopName, defaultLang: cfg.defaultLang } });
  const r = seedDemo(db, { products: n });
  db.pragma('optimize');
  db.close();
  console.log(`Done: ${r.products} products in ${(r.ms / 1000).toFixed(1)}s`);
}
