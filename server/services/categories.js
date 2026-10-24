import { AppError, FieldErrors, notFound, fieldError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { LIMITS } from '../lib/limits.js';

const SELECT_ALIVE = 'SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL';

export function getCategory(db, id) {
  return db.stmt(SELECT_ALIVE).get(id);
}

/** Full tree (or flat list with path) of live categories with direct product counts. */
export function listCategories(db, { flat = false } = {}) {
  const rows = db.stmt(
    `SELECT id, parent_id, name, position, created_at, updated_at
       FROM categories WHERE deleted_at IS NULL ORDER BY position, name COLLATE NOCASE`
  ).all();
  const counts = new Map(
    db.stmt(
      `SELECT category_id, COUNT(*) AS n FROM products
        WHERE deleted_at IS NULL AND category_id IS NOT NULL GROUP BY category_id`
    ).all().map((r) => [r.category_id, r.n])
  );
  const byId = new Map();
  for (const r of rows) byId.set(r.id, { ...r, product_count: counts.get(r.id) || 0, children: [] });
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  if (!flat) return roots;
  const out = [];
  const walk = (nodes, pathNames, depth) => {
    for (const n of nodes) {
      const p = [...pathNames, n.name];
      out.push({
        id: n.id, parent_id: n.parent_id, name: n.name, position: n.position, depth,
        path: p.join(' > '), product_count: n.product_count, child_count: n.children.length,
      });
      walk(n.children, p, depth + 1);
    }
  };
  walk(roots, [], 0);
  return out;
}

/** ids of a category and all its live descendants. */
export function descendantIds(db, id) {
  return db.stmt(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id WHERE c.deleted_at IS NULL
     ) SELECT id FROM sub`
  ).pluck().all(id);
}

/** [{id,name}] from root down to the category. */
export function categoryPath(db, id) {
  if (!id) return [];
  return db.stmt(
    `WITH RECURSIVE up(id, parent_id, name, lvl) AS (
       SELECT id, parent_id, name, 0 FROM categories WHERE id = ?
       UNION ALL
       SELECT c.id, c.parent_id, c.name, up.lvl + 1 FROM categories c JOIN up ON c.id = up.parent_id
     ) SELECT id, name FROM up ORDER BY lvl DESC`
  ).all(id);
}

function assertNameFree(db, parentId, name, selfId = 0) {
  const clash = db.stmt(
    `SELECT id FROM categories
      WHERE COALESCE(parent_id, 0) = COALESCE(?, 0) AND name = ? COLLATE NOCASE
        AND deleted_at IS NULL AND id <> ?`
  ).get(parentId, name, selfId);
  if (clash) throw fieldError('name', 'category_name_taken', { name });
}

function siblings(db, parentId, excludeId = 0) {
  return db.stmt(
    `SELECT * FROM categories WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)
        AND deleted_at IS NULL AND id <> ? ORDER BY position, id`
  ).all(parentId, excludeId);
}

/** Renumber siblings 0..n, placing `selfId` at `index` (when given). */
function renumber(w, parentId, selfId = null, index = null) {
  const list = siblings(w.db, parentId, selfId || 0);
  if (selfId) {
    const at = index === null ? list.length : Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, w.get('categories', selfId));
  }
  list.forEach((row, i) => {
    if (row.position !== i) w.update('categories', row.id, { position: i }, null, row);
  });
}

function readParent(db, errs, raw) {
  if (raw === null || raw === undefined || raw === '' || raw === 0) return null;
  const pid = v.int(errs, 'parent_id', raw, { min: 1 });
  if (pid && !getCategory(db, pid)) errs.add('parent_id', 'category_parent_not_found');
  return pid;
}

export function createCategory(w, body = {}) {
  const errs = new FieldErrors();
  const name = v.str(errs, 'name', body.name, { required: true, max: LIMITS.categoryName });
  const parentId = readParent(w.db, errs, body.parent_id);
  const position = v.int(errs, 'position', body.position, { min: 0 });
  errs.throwIfAny();
  assertNameFree(w.db, parentId, name);
  return w.db.transaction(() => {
    const max = w.db.stmt(
      `SELECT COALESCE(MAX(position), -1) FROM categories WHERE COALESCE(parent_id,0) = COALESCE(?,0) AND deleted_at IS NULL`
    ).pluck().get(parentId);
    const id = w.insert('categories', { parent_id: parentId, name, position: max + 1 });
    if (position !== null) renumber(w, parentId, id, position);
    return getCategory(w.db, id);
  })();
}

export function updateCategory(w, id, body = {}) {
  const db = w.db;
  const cur = getCategory(db, id);
  if (!cur) throw notFound('category');
  const errs = new FieldErrors();
  const name = 'name' in body ? v.str(errs, 'name', body.name, { required: true, max: LIMITS.categoryName }) : cur.name;
  const parentId = 'parent_id' in body ? readParent(db, errs, body.parent_id) : cur.parent_id;
  const position = 'position' in body ? v.int(errs, 'position', body.position, { min: 0 }) : null;
  errs.throwIfAny();

  if (parentId !== cur.parent_id && parentId !== null) {
    // Cannot move under itself or a descendant.
    if (descendantIds(db, id).includes(parentId)) {
      throw new AppError(422, 'VALIDATION', 'validation_failed', {}, { parent_id: ['category_cycle', {}] });
    }
  }
  if (name.toLowerCase() !== cur.name.toLowerCase() || parentId !== cur.parent_id) assertNameFree(db, parentId, name, id);

  return db.transaction(() => {
    const moved = parentId !== cur.parent_id;
    w.update('categories', id, { name, parent_id: parentId }, null, cur);
    if (moved) {
      renumber(w, cur.parent_id); // close the gap in the old parent
      renumber(w, parentId, id, position);
    } else if (position !== null) {
      renumber(w, parentId, id, position);
    }
    return getCategory(db, id);
  })();
}

export function deleteCategory(w, id) {
  const db = w.db;
  const cur = getCategory(db, id);
  if (!cur) throw notFound('category');
  const children = db.stmt('SELECT COUNT(*) FROM categories WHERE parent_id = ? AND deleted_at IS NULL').pluck().get(id);
  if (children) throw new AppError(409, 'CATEGORY_HAS_CHILDREN', 'category_has_children', { name: cur.name, count: children });
  const products = db.stmt('SELECT COUNT(*) FROM products WHERE category_id = ? AND deleted_at IS NULL').pluck().get(id);
  if (products) throw new AppError(409, 'CATEGORY_HAS_PRODUCTS', 'category_has_products', { name: cur.name, count: products });
  db.transaction(() => {
    w.softDelete('categories', id, null, cur);
    renumber(w, cur.parent_id);
  })();
}
