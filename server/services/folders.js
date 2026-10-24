// Image folders mirror the category tree under UPLOAD_DIR:
//   UPLOAD_DIR/<root-slug>/<child-slug>/<uuid>.webp (+ <uuid>.thumb.webp)
// categories.folder holds the full relative path ('keripik/keripik-pisang'); product_images.file/thumb
// hold the relative path of each file. Every path is server-generated ([a-z0-9-] segments + uuid
// names) and checked by safeRel() before touching the disk. Files are never deleted here.
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../lib/errors.js';

const SLUG_MAX = 60;
// Windows device names cannot be used as folder names.
const RESERVED = new Set(['con', 'prn', 'aux', 'nul', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`com${n}`, `lpt${n}`])]);
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EEXIST']);

/** 'Keripik Pisang' -> 'keripik-pisang'. Lowercase ascii, [a-z0-9-] only; '' when nothing is left. */
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

/** Validates a relative upload path: posix separators, no '..', '.', empty or absolute segments. */
export function safeRel(rel) {
  const s = String(rel ?? '');
  const ok = s.length > 0 && s.length < 1024 && !s.includes('\\') && !s.includes('\0') && !s.startsWith('/')
    && !path.isAbsolute(s) && !/^[a-zA-Z]:/.test(s)
    && s.split('/').every((seg) => seg && seg !== '.' && seg !== '..');
  if (!ok) throw new AppError(500, 'UNSAFE_PATH', 'internal');
  return s;
}

/** Absolute path of a relative upload path ('' = UPLOAD_DIR itself); never escapes uploadDir. */
export function absPath(uploadDir, rel) {
  const root = path.resolve(uploadDir);
  if (!rel) return root;
  const p = path.resolve(root, ...safeRel(rel).split('/'));
  if (!p.startsWith(root + path.sep)) throw new AppError(500, 'UNSAFE_PATH', 'internal');
  return p;
}

export const joinRel = (folder, name) => (folder ? `${folder}/${name}` : name);
export const dirOfRel = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const baseOfRel = (rel) => rel.slice(rel.lastIndexOf('/') + 1);

/** Folder ('' = upload root) of a category id; null/unknown category -> root. */
export function categoryFolder(db, categoryId) {
  if (!categoryId) return '';
  return db.stmt('SELECT folder FROM categories WHERE id = ?').pluck().get(categoryId) || '';
}

/** Folder of a product's category ('' = root). */
export function productFolder(db, productId) {
  return db.stmt(
    'SELECT c.folder FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?'
  ).pluck().get(productId) || '';
}

function isTaken(db, uploadDir, rel, { selfId = 0, keep = null, disk = true }) {
  if (rel === keep) return false;
  if (RESERVED.has(baseOfRel(rel))) return true;
  if (db.stmt('SELECT 1 FROM categories WHERE folder = ? AND id <> ?').get(rel, selfId)) return true;
  return Boolean(disk && uploadDir && fs.existsSync(absPath(uploadDir, rel)));
}

/**
 * Unique folder for a category named `name` under `parentFolder`: slug, then slug-2, slug-3, ...
 * Taken = another category row (live or deleted) has it, or (disk) it already exists on disk.
 * `keep` is the category's current folder (always allowed, so a no-op rename keeps its folder).
 * `fallbackId` names a slug-less category ('category-<id>').
 */
export function pickFolder(db, uploadDir, parentFolder, name, { selfId = 0, keep = null, fallbackId = null, disk = true } = {}) {
  const slug = slugify(name) || `category-${fallbackId ?? selfId}`;
  return uniqueRel(db, uploadDir, joinRel(parentFolder, slug), { selfId, keep, disk });
}

function uniqueRel(db, uploadDir, base, opts) {
  for (let n = 1; ; n++) {
    const rel = n === 1 ? base : `${base}-${n}`;
    if (!isTaken(db, uploadDir, rel, opts)) return rel;
  }
}

/** '<folder>-unused', then -unused-2, -unused-3 ... for a soft-deleted category. */
export function unusedFolder(db, uploadDir, folder, selfId) {
  return uniqueRel(db, uploadDir, `${folder}-unused`, { selfId });
}

// ---------------------------------------------------------------------------
// Disk operations with undo. Synchronous (they run inside better-sqlite3 transactions) and they
// never keep a handle open. Windows briefly locks files that are being read (e.g. a photo being
// served) -> a few short retries before giving up with a friendly error.

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (!BUSY.has(e.code) || i >= 5) throw e;
      sleepMs(40 * (i + 1));
    }
  }
}

export function fileError(e) {
  if (e instanceof AppError) return e;
  return BUSY.has(e?.code)
    ? new AppError(409, 'FOLDER_BUSY', 'folder_busy')
    : new AppError(500, 'FILE_MOVE_FAILED', 'file_move_failed');
}

export class FileOps {
  constructor(uploadDir) {
    this.uploadDir = uploadDir;
    this.done = []; // [fromAbs, toAbs, createdDirs[]]
  }

  /** Rename a file or folder (relative paths). Missing source -> false (nothing to move). */
  move(fromRel, toRel) {
    if (!this.uploadDir || fromRel === toRel) return false;
    const from = absPath(this.uploadDir, fromRel);
    const to = absPath(this.uploadDir, toRel);
    if (!fs.existsSync(from)) return false;
    if (fs.existsSync(to)) throw new AppError(409, 'FOLDER_BUSY', 'folder_busy');
    const created = this.mkdir(path.dirname(to));
    try {
      renameRetry(from, to);
    } catch (e) {
      this.rmdirs(created);
      throw fileError(e);
    }
    this.done.push([from, to, created]);
    return true;
  }

  /** mkdir -p (absolute); returns the folders it created (deepest last) so undo can remove them. */
  mkdir(abs) {
    const created = [];
    let p = abs;
    while (!fs.existsSync(p)) {
      created.unshift(p);
      const up = path.dirname(p);
      if (up === p) break;
      p = up;
    }
    if (created.length) {
      try { fs.mkdirSync(abs, { recursive: true }); } catch (e) { throw fileError(e); }
    }
    return created;
  }

  rmdirs(created) {
    for (const d of [...created].reverse()) {
      try { fs.rmdirSync(d); } catch { /* not empty / gone: keep */ }
    }
  }

  /** Reverse every move (best effort, newest first). */
  undo() {
    for (const [from, to, created] of this.done.reverse()) {
      try { renameRetry(to, from); } catch (e) { console.error(`[folders] undo failed ${to} -> ${from}`, e); }
      this.rmdirs(created);
    }
    this.done = [];
  }
}

/**
 * Runs `fn(ops)` (synchronous DB writes + ops.move calls) in one transaction. If anything throws,
 * the DB rolls back and all completed file moves are undone. File errors become friendly AppErrors.
 */
export function withFileOps(db, uploadDir, fn) {
  const ops = new FileOps(uploadDir);
  try {
    return db.transaction(() => fn(ops))();
  } catch (e) {
    ops.undo();
    throw !(e instanceof AppError) && /^E[A-Z]+$/.test(String(e?.code)) ? fileError(e) : e;
  }
}

// ---------------------------------------------------------------------------
// DB bookkeeping

const rangeEnd = (prefix) => `${prefix.slice(0, -1)}0`; // 'a/b/' -> 'a/b0' ('0' follows '/')
const swapPrefix = (s, oldF, newF) => (s === oldF ? newF : s.startsWith(`${oldF}/`) ? newF + s.slice(oldF.length) : s);

/**
 * After folder `oldF` was renamed to `newF` on disk: rewrite categories.folder of the category
 * and every descendant (live or deleted) and the paths of every product_images row under it.
 * Category rows are audited; image path rows are audited without product_id (system bookkeeping
 * that should not clutter each product's history).
 */
export function relocateFolder(w, oldF, newF) {
  if (!oldF || oldF === newF) return;
  const db = w.db;
  const pre = `${oldF}/`;
  const cats = db.stmt('SELECT * FROM categories WHERE folder = ? OR (folder >= ? AND folder < ?) ORDER BY id')
    .all(oldF, pre, rangeEnd(pre));
  for (const c of cats) w.update('categories', c.id, { folder: swapPrefix(c.folder, oldF, newF) }, null, c);
  const imgs = db.stmt('SELECT * FROM product_images WHERE file >= ? AND file < ?').all(pre, rangeEnd(pre));
  for (const im of imgs) {
    w.update('product_images', im.id, { file: swapPrefix(im.file, oldF, newF), thumb: swapPrefix(im.thumb, oldF, newF) }, null, im);
  }
}

/**
 * Moves every image file (+ thumb) of a product into `folder` and updates the rows (audited on the
 * product). Rows already in `folder` are left alone. Missing files only get their DB path fixed.
 */
export function moveProductImages(w, ops, productId, folder) {
  const db = w.db;
  const rows = db.stmt('SELECT * FROM product_images WHERE product_id = ? ORDER BY id').all(productId);
  for (const im of rows) {
    if (dirOfRel(im.file) === folder && dirOfRel(im.thumb) === folder) continue;
    const file = joinRel(folder, baseOfRel(im.file));
    const thumb = joinRel(folder, baseOfRel(im.thumb));
    ops.move(im.file, file);
    if (im.thumb !== im.file) ops.move(im.thumb, thumb);
    w.update('product_images', im.id, { file, thumb }, productId, im);
  }
}

/**
 * Startup (idempotent):
 *  1. live categories without a folder get one (parents first; existing dirs are adopted);
 *  2. every live category folder exists on disk (mkdir -p);
 *  3. image files that are not in their product's category folder (e.g. legacy files in the
 *     upload root) are moved there and their rows updated.
 */
export function syncFolders(db, uploadDir) {
  const setFolder = db.prepare('UPDATE categories SET folder = ? WHERE id = ?');
  const folderOf = db.prepare('SELECT folder FROM categories WHERE id = ?').pluck();
  db.transaction(() => {
    let pending = db.prepare('SELECT id, parent_id, name FROM categories WHERE folder IS NULL AND deleted_at IS NULL ORDER BY id').all();
    while (pending.length) {
      const next = [];
      for (const c of pending) {
        const parent = c.parent_id ? folderOf.get(c.parent_id) : '';
        if (parent === null && pending.some((p) => p.id === c.parent_id)) { next.push(c); continue; }
        setFolder.run(pickFolder(db, uploadDir, parent || '', c.name, { selfId: c.id, disk: false }), c.id);
      }
      if (next.length === pending.length) break; // cannot happen (no cycles); safety stop
      pending = next;
    }
  })();
  if (!uploadDir) return { moved: 0 };

  fs.mkdirSync(uploadDir, { recursive: true });
  for (const f of db.prepare('SELECT folder FROM categories WHERE deleted_at IS NULL AND folder IS NOT NULL').pluck().all()) {
    try { fs.mkdirSync(absPath(uploadDir, f), { recursive: true }); } catch (e) { console.error(`[folders] cannot create ${f}:`, e.message); }
  }

  const stray = db.prepare(
    `SELECT i.id, i.file, i.thumb, c.folder FROM product_images i
       JOIN products p ON p.id = i.product_id
       JOIN categories c ON c.id = p.category_id
      WHERE c.folder IS NOT NULL
        AND NOT (substr(i.file, 1, length(c.folder) + 1) = c.folder || '/'
                 AND instr(substr(i.file, length(c.folder) + 2), '/') = 0
                 AND substr(i.thumb, 1, length(c.folder) + 1) = c.folder || '/'
                 AND instr(substr(i.thumb, length(c.folder) + 2), '/') = 0)`
  ).all();
  const upd = db.prepare('UPDATE product_images SET file = ?, thumb = ? WHERE id = ?');
  let moved = 0;
  for (const im of stray) {
    const file = joinRel(im.folder, baseOfRel(im.file));
    const thumb = joinRel(im.folder, baseOfRel(im.thumb));
    try {
      for (const [a, b] of im.thumb === im.file ? [[im.file, file]] : [[im.file, file], [im.thumb, thumb]]) {
        const from = absPath(uploadDir, a);
        const to = absPath(uploadDir, b);
        if (fs.existsSync(from) && !fs.existsSync(to)) renameRetry(from, to);
      }
      upd.run(file, thumb, im.id);
      moved += 1;
    } catch (e) {
      console.error(`[folders] could not move image ${im.id} (${im.file}) into ${im.folder}:`, e.message);
    }
  }
  return { moved };
}
