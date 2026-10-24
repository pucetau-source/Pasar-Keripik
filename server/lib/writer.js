// Audited write helpers. Every insert/update/soft-delete goes through here so each write
// appends an audit_log row (who, when (WIB), table, record id, action, before/after JSON).
// Table/column names always come from server code, never from request input.
import { randomUUID } from 'node:crypto';
import { nowWib } from './time.js';

export class Writer {
  constructor(db, user) {
    this.db = db;
    this.userId = user ? user.id : null;
    this.newTxn();
  }

  /** Starts a new audit group ("one save"). A Writer is created per request, so normally never needed. */
  newTxn() {
    this.txn = randomUUID();
    return this.txn;
  }

  log(table, recordId, action, before, after, productId = null) {
    this.db.stmt(
      `INSERT INTO audit_log (at, user_id, table_name, record_id, product_id, action, before_json, after_json, txn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nowWib(), this.userId, table, recordId, productId, action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      this.txn
    );
  }

  get(table, id) {
    return this.db.stmt(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  }

  insert(table, data, productId = null) {
    const now = nowWib();
    const row = { ...data, created_by: this.userId, updated_by: this.userId, created_at: now, updated_at: now };
    const cols = Object.keys(row);
    const id = Number(this.db.stmt(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    ).run(...cols.map((c) => row[c])).lastInsertRowid);
    const after = this.get(table, id);
    this.log(table, id, 'create', null, after, productId ?? (table === 'products' ? id : null));
    return id;
  }

  /** Applies only the columns that actually differ. Returns true when something changed. */
  update(table, id, changes, productId = null, before = null) {
    before = before || this.get(table, id);
    if (!before) return false;
    const diff = {};
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined) continue;
      if (before[k] !== v) diff[k] = v;
    }
    if (Object.keys(diff).length === 0) return false;
    diff.updated_by = this.userId;
    diff.updated_at = nowWib();
    const cols = Object.keys(diff);
    this.db.stmt(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((c) => diff[c]), id);
    this.log(table, id, 'update', before, this.get(table, id), productId ?? (table === 'products' ? id : null));
    return true;
  }

  softDelete(table, id, productId = null, before = null) {
    before = before || this.get(table, id);
    if (!before || before.deleted_at) return false;
    const now = nowWib();
    this.db.stmt(`UPDATE ${table} SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?`)
      .run(now, this.userId, now, id);
    this.log(table, id, 'delete', before, this.get(table, id), productId ?? (table === 'products' ? id : null));
    return true;
  }
}
