import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db/index.js';

test('migrations + base seed are idempotent; pragmas set', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-db-'));
  const file = path.join(dir, 'x.db');
  let db = openDb(file);
  const count = () => ({
    users: db.prepare('SELECT COUNT(*) FROM users').pluck().get(),
    units: db.prepare('SELECT COUNT(*) FROM units').pluck().get(),
    settings: db.prepare('SELECT COUNT(*) FROM settings').pluck().get(),
    migrations: db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(),
    products: db.prepare('SELECT COUNT(*) FROM products').pluck().get(),
    categories: db.prepare('SELECT COUNT(*) FROM categories').pluck().get(),
  });
  const first = count();
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  db.close();
  db = openDb(file);
  assert.deepEqual(count(), first);
  assert.equal(first.users, 1);
  assert.equal(first.units, 3);
  assert.equal(first.products, 0, 'no sample products seeded');
  assert.equal(first.categories, 0, 'no sample categories seeded');
  const admin = db.prepare(`SELECT * FROM users WHERE userid = 'admin1'`).get();
  assert.equal(admin.name, 'admin pasar keripik');
  assert.match(admin.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const units = db.prepare('SELECT symbol, to_base FROM units ORDER BY position').all();
  assert.deepEqual(units, [{ symbol: 'g', to_base: 1 }, { symbol: 'kg', to_base: 1000 }, { symbol: 'mg', to_base: 0.001 }]);
  // FK enforced
  assert.throws(() => db.prepare(`INSERT INTO products (name, category_id) VALUES ('x', 999)`).run(), /FOREIGN KEY/);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
