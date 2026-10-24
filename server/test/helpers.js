import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';

/** Starts an in-process server on a random port with a fresh temp DB + upload dir. */
export async function startServer(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-test-'));
  const { app, db, cfg } = createApp({ dbFile: path.join(dir, 'test.db'), uploadDir: path.join(dir, 'uploads'), ...overrides });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function api(method, url, body, { lang = 'en', headers = {} } = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(origin + '/api' + url, {
      method,
      headers: { 'accept-language': lang, ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }

  async function close() {
    await new Promise((r) => server.close(r));
    db.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows file locks */ }
  }

  const units = db.prepare('SELECT * FROM units ORDER BY id').all();
  const unit = (symbol) => units.find((u) => u.symbol === symbol).id;
  return { api, close, db, cfg, origin, unit };
}

let seq = 0;
/** Minimal valid single-variant product payload. */
export function simpleProduct(categoryId, unitId, extra = {}) {
  seq += 1;
  return {
    name: `Keripik Test ${seq}`,
    category_id: categoryId,
    axes: [],
    variants: [{ option_values: [], price: 10000, stock: 0, weight_value: 100, weight_unit_id: unitId }],
    ...extra,
  };
}
