import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { absPath, joinRel, productFolder, withFileOps, dirOfRel } from './folders.js';
import { AppError, FieldErrors, notFound } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { getSetting } from './settings.js';

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAIN_PX = 1600;
const baseName = (rel) => rel.slice(rel.lastIndexOf('/') + 1);
const THUMB_PX = 320;
// sharp only ever reads buffers here, but never let its file cache keep a handle open (Windows
// cannot rename a folder that contains an open file).
sharp.cache({ files: 0 });

/** file/thumb are paths relative to UPLOAD_DIR ('keripik/keripik-pisang/<uuid>.webp'). */
export function imageUrls(row) {
  return { url: `/uploads/${row.file}`, thumb_url: `/uploads/${row.thumb}` };
}

function liveImages(db, productId) {
  return db.stmt('SELECT * FROM product_images WHERE product_id = ? AND deleted_at IS NULL ORDER BY position, id').all(productId);
}

function publicImage(im) {
  return {
    id: im.id, product_id: im.product_id, variant_id: im.variant_id, position: im.position,
    is_cover: im.is_cover === 1, width: im.width, height: im.height, ...imageUrls(im),
  };
}

export function listImages(db, productId) {
  return liveImages(db, productId).map(publicImage);
}

function assertProduct(db, productId) {
  if (!db.stmt('SELECT 1 FROM products WHERE id = ? AND deleted_at IS NULL').get(productId)) throw notFound('product');
}

function assertVariant(db, productId, variantId, field) {
  if (variantId === null || variantId === undefined) return;
  if (!db.stmt('SELECT 1 FROM product_variants WHERE id = ? AND product_id = ? AND deleted_at IS NULL').get(variantId, productId)) {
    throw new AppError(422, 'VALIDATION', 'validation_failed', {}, { [field]: ['variant_not_found_for_image', {}] });
  }
}

/** Ensure exactly one cover (the first by position) when images exist. */
function fixCover(w, productId) {
  const imgs = liveImages(w.db, productId);
  if (!imgs.length) return;
  const covers = imgs.filter((i) => i.is_cover === 1);
  if (covers.length === 1) return;
  const keep = covers[0] || imgs[0];
  for (const im of imgs) {
    const want = im.id === keep.id ? 1 : 0;
    if (im.is_cover !== want) w.update('product_images', im.id, { is_cover: want }, productId, im);
  }
}

/**
 * files: multer memory files. Images are re-encoded to WEBP (max 1600px) + 320px thumbnail.
 */
export async function uploadImages(w, uploadDir, productId, files, body = {}) {
  const db = w.db;
  assertProduct(db, productId);
  if (!files || files.length === 0) {
    throw new AppError(422, 'VALIDATION', 'validation_failed', {}, { images: ['image_required', {}] });
  }
  const errs = new FieldErrors();
  const variantId = v.int(errs, 'variant_id', body.variant_id, { min: 1 });
  errs.throwIfAny();
  assertVariant(db, productId, variantId, 'variant_id');
  const max = Number(getSetting(db, 'max_images_per_product') || 9);
  const count = liveImages(db, productId).length;
  if (count + files.length > max) throw new AppError(422, 'IMAGE_TOO_MANY', 'image_too_many', { max, count });

  // Files go straight into the folder of the product's category (UPLOAD_DIR root without one).
  const processed = [];
  const remove = () => Promise.all(processed.flatMap((p) => [p.file, p.thumb])
    .map((n) => fs.rm(absPath(uploadDir, n), { force: true }).catch(() => {})));
  try {
    for (const f of files) {
      const base = randomUUID();
      const img = sharp(f.buffer, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate();
      let main;
      try {
        main = await img.clone().resize(MAIN_PX, MAIN_PX, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      } catch {
        throw new AppError(422, 'IMAGE_UNREADABLE', 'image_unreadable', { file: f.originalname });
      }
      const thumb = await img.clone().resize(THUMB_PX, THUMB_PX, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70 }).toBuffer();
      const folder = productFolder(db, productId); // re-read: a rename may have happened while encoding
      const file = joinRel(folder, `${base}.webp`);
      const thumbFile = joinRel(folder, `${base}.thumb.webp`);
      processed.push({ file, thumb: thumbFile, width: main.info.width, height: main.info.height });
      await fs.mkdir(absPath(uploadDir, folder), { recursive: true });
      await fs.writeFile(absPath(uploadDir, file), main.data);
      await fs.writeFile(absPath(uploadDir, thumbFile), thumb);
    }
  } catch (e) {
    await remove();
    throw e;
  }

  let ids;
  try {
    ids = withFileOps(db, uploadDir, (ops) => {
      // The category may have been renamed/moved (or the product re-categorised) while we encoded.
      const now = productFolder(db, productId);
      if (!db.stmt('SELECT 1 FROM products WHERE id = ? AND deleted_at IS NULL').get(productId)) throw notFound('product');
      const final = processed.map((p) => {
        if (dirOfRel(p.file) === now) return p;
        const moved = { ...p, file: joinRel(now, baseName(p.file)), thumb: joinRel(now, baseName(p.thumb)) };
        ops.move(p.file, moved.file);
        ops.move(p.thumb, moved.thumb);
        return moved;
      });
      let pos = db.stmt('SELECT COALESCE(MAX(position), -1) FROM product_images WHERE product_id = ? AND deleted_at IS NULL').pluck().get(productId);
      const out = final.map((p) => w.insert('product_images', {
        product_id: productId, variant_id: variantId, file: p.file, thumb: p.thumb,
        width: p.width, height: p.height, position: ++pos, is_cover: 0,
      }, productId));
      fixCover(w, productId);
      return out;
    });
  } catch (e) {
    await remove();
    throw e;
  }
  return listImages(db, productId).filter((im) => ids.includes(im.id));
}

/** body: { order: [imageId, ...] (all live images, exactly once), cover_id?: imageId } */
export function reorderImages(w, productId, body = {}) {
  const db = w.db;
  assertProduct(db, productId);
  const imgs = liveImages(db, productId);
  const order = Array.isArray(body.order) ? body.order.map(Number) : null;
  const ids = new Set(imgs.map((i) => i.id));
  if (!order || order.length !== imgs.length || new Set(order).size !== order.length || !order.every((id) => ids.has(id))) {
    throw new AppError(422, 'VALIDATION', 'validation_failed', {}, { order: ['image_order_mismatch', {}] });
  }
  let coverId = body.cover_id === undefined || body.cover_id === null ? null : Number(body.cover_id);
  if (coverId !== null && !ids.has(coverId)) {
    throw new AppError(422, 'VALIDATION', 'validation_failed', {}, { cover_id: ['not_found', { entity: 'image' }] });
  }
  if (coverId === null) coverId = order[0] ?? null; // first photo is the cover
  db.transaction(() => {
    order.forEach((id, i) => {
      const im = imgs.find((x) => x.id === id);
      w.update('product_images', id, { position: i, is_cover: id === coverId ? 1 : 0 }, productId, im);
    });
  })();
  return listImages(db, productId);
}

/** body: { variant_id?: id|null, is_cover?: true } */
export function updateImage(w, imageId, body = {}) {
  const db = w.db;
  const im = db.stmt('SELECT * FROM product_images WHERE id = ? AND deleted_at IS NULL').get(imageId);
  if (!im) throw notFound('image');
  const changes = {};
  if ('variant_id' in body) {
    const errs = new FieldErrors();
    changes.variant_id = v.int(errs, 'variant_id', body.variant_id, { min: 1 });
    errs.throwIfAny();
    assertVariant(db, im.product_id, changes.variant_id, 'variant_id');
  }
  db.transaction(() => {
    if (body.is_cover === true) {
      for (const other of liveImages(db, im.product_id)) {
        if (other.id !== im.id && other.is_cover === 1) w.update('product_images', other.id, { is_cover: 0 }, im.product_id, other);
      }
      changes.is_cover = 1;
    }
    w.update('product_images', imageId, changes, im.product_id, im);
  })();
  return publicImage(db.stmt('SELECT * FROM product_images WHERE id = ?').get(imageId));
}

/** Soft delete (file stays on disk). The next photo becomes cover if needed. */
export function deleteImage(w, imageId) {
  const db = w.db;
  const im = db.stmt('SELECT * FROM product_images WHERE id = ? AND deleted_at IS NULL').get(imageId);
  if (!im) throw notFound('image');
  db.transaction(() => {
    w.softDelete('product_images', imageId, im.product_id, im);
    const rest = liveImages(db, im.product_id);
    rest.forEach((r, i) => { if (r.position !== i) w.update('product_images', r.id, { position: i }, im.product_id, r); });
    fixCover(w, im.product_id);
  })();
}
