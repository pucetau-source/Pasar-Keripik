// Base seed: runs at every startup, idempotent (inserts only what is missing).
// Inserts the Phase 1 user, base units and settings. No products/categories here
// (demo data lives in scripts/seed-demo.js).

const BASE_UNITS = [
  // name, symbol, to_base (grams)
  ['gram', 'g', 1, 1],
  ['kilogram', 'kg', 1000, 2],
  ['miligram', 'mg', 0.001, 3],
];

export function seedBase(db, opts = {}) {
  const adminUserid = opts.adminUserid || 'admin1';
  const adminName = opts.adminName || 'admin pasar keripik';
  const shopName = opts.shopName || 'Pasar Keripik';
  const defaultLang = opts.defaultLang || 'id';

  const audit = db.prepare(
    `INSERT INTO audit_log (user_id, table_name, record_id, action, before_json, after_json)
     VALUES (?, ?, ?, 'create', NULL, ?)`
  );

  db.transaction(() => {
    let admin = db.prepare('SELECT * FROM users WHERE userid = ?').get(adminUserid);
    if (!admin) {
      const id = db.prepare(`INSERT INTO users (userid, name, role) VALUES (?, ?, 'super_admin')`)
        .run(adminUserid, adminName).lastInsertRowid;
      db.prepare('UPDATE users SET created_by = ?, updated_by = ? WHERE id = ?').run(id, id, id);
      admin = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      audit.run(id, 'users', id, JSON.stringify(admin));
    }
    const uid = admin.id;

    const anyUnit = db.prepare('SELECT COUNT(*) FROM units').pluck().get();
    if (!anyUnit) {
      const ins = db.prepare('INSERT INTO units (name, symbol, to_base, position, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)');
      for (const [name, symbol, toBase, pos] of BASE_UNITS) {
        const id = ins.run(name, symbol, toBase, pos, uid, uid).lastInsertRowid;
        audit.run(uid, 'units', id, JSON.stringify(db.prepare('SELECT * FROM units WHERE id = ?').get(id)));
      }
    }

    const settings = {
      shop_name: shopName,
      default_language: defaultLang,
      max_images_per_product: '9',
      stock_reasons: JSON.stringify(['restock', 'adjustment', 'stock_opname', 'damaged', 'expired', 'return']),
      sku_prefix: 'PK',
      tagline: 'Renyahnya, selalu bikin happy',
      low_stock_threshold: '10',
      logo_file: null, // file name in UPLOAD_DIR; null = default icon
    };
    const has = db.prepare('SELECT 1 FROM settings WHERE key = ?');
    const insS = db.prepare('INSERT INTO settings (key, value, created_by, updated_by) VALUES (?, ?, ?, ?)');
    for (const [k, v] of Object.entries(settings)) {
      if (!has.get(k)) {
        insS.run(k, v, uid, uid);
        audit.run(uid, 'settings', null, JSON.stringify({ key: k, value: v }));
      }
    }
  })();
}
