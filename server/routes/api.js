import express from 'express';
import multer from 'multer';
import { AppError, notFound } from '../lib/errors.js';
import { idParam } from '../lib/validate.js';
import * as categories from '../services/categories.js';
import * as units from '../services/units.js';
import * as products from '../services/products.js';
import * as images from '../services/images.js';
import * as discounts from '../services/discounts.js';
import * as stock from '../services/stock.js';
import * as misc from '../services/misc.js';
import { allSettings, updateSettings, uploadLogo, deleteLogo, LOGO_MAX_BYTES, LOGO_MIME } from '../services/settings.js';

const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.then === 'function') out.catch(next);
  } catch (e) {
    next(e);
  }
};

function id(req, entity, name = 'id') {
  const n = idParam(req.params[name]);
  if (!n) throw notFound(entity);
  return n;
}

export function apiRouter(db, cfg) {
  const r = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: cfg.maxUploadMb * 1024 * 1024, files: 20, fields: 20 },
    fileFilter: (_req, file, cb) => {
      if (images.IMAGE_MIME.includes(file.mimetype)) cb(null, true);
      else cb(new AppError(415, 'IMAGE_TYPE', 'image_type', { file: file.originalname }));
    },
  });

  const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 5 },
    fileFilter: (_req, file, cb) => {
      // SVG (and anything else) is rejected; the content is sniffed again by sharp.
      if (LOGO_MIME.includes(file.mimetype)) cb(null, true);
      else cb(new AppError(415, 'IMAGE_TYPE', 'image_type', { file: file.originalname }));
    },
  });
  const logoMiddleware = (req, res, next) => logoUpload.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(err.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'IMAGE_TOO_LARGE', 'image_too_large', { max: LOGO_MAX_BYTES / 1024 / 1024 })
        : new AppError(422, 'UPLOAD_LIMIT', 'too_many', { max: 1 }));
    }
    next(err);
  });

  // Me / settings
  r.get('/me', (req, res) => res.json(req.user));
  r.get('/settings', (req, res) => res.json(allSettings(db, req.lang)));
  r.put('/settings', wrap((req, res) => res.json(updateSettings(req.w, req.body, req.lang, { uploadDir: cfg.uploadDir }))));
  r.post('/settings/logo', logoMiddleware, wrap(async (req, res) => {
    res.json(await uploadLogo(req.w, cfg.uploadDir, req.file, req.lang));
  }));
  r.delete('/settings/logo', wrap((req, res) => res.json(deleteLogo(req.w, cfg.uploadDir, req.lang))));

  // Dashboard stats
  r.get('/stats', wrap((_req, res) => res.json(misc.productStats(db))));

  // Categories
  r.get('/categories', wrap((req, res) => res.json(categories.listCategories(db, { flat: req.query.flat === '1' }))));
  r.post('/categories', wrap((req, res) => res.status(201).json(categories.createCategory(req.w, req.body))));
  r.put('/categories/:id', wrap((req, res) => res.json(categories.updateCategory(req.w, id(req, 'category'), req.body))));
  r.delete('/categories/:id', wrap((req, res) => {
    categories.deleteCategory(req.w, id(req, 'category'));
    res.status(204).end();
  }));

  // Units
  r.get('/units', wrap((_req, res) => res.json(units.listUnits(db))));
  r.post('/units', wrap((req, res) => res.status(201).json(units.createUnit(req.w, req.body))));
  r.put('/units/:id', wrap((req, res) => res.json(units.updateUnit(req.w, id(req, 'unit'), req.body))));
  r.delete('/units/:id', wrap((req, res) => {
    units.deleteUnit(req.w, id(req, 'unit'));
    res.status(204).end();
  }));

  // Products
  r.get('/products', wrap((req, res) => res.json(products.listProducts(db, req.query))));
  r.get('/products/:id', wrap((req, res) => res.json(products.getProductDetail(db, id(req, 'product')))));
  r.post('/products', wrap((req, res) => res.status(201).json(products.createProduct(req.w, req.body))));
  r.post('/products/:id/duplicate', wrap(async (req, res) => {
    res.status(201).json(await products.duplicateProduct(req.w, id(req, 'product'), { lang: req.lang, uploadDir: cfg.uploadDir }));
  }));
  r.put('/products/:id', wrap((req, res) => res.json(products.updateProduct(req.w, id(req, 'product'), req.body))));
  r.delete('/products/:id', wrap((req, res) => {
    products.deleteProduct(req.w, id(req, 'product'));
    res.status(204).end();
  }));
  r.get('/products/:id/audit', wrap((req, res) => res.json(misc.productAudit(db, id(req, 'product'), req.query, req.lang))));

  // Images
  r.get('/products/:id/images', wrap((req, res) => res.json(images.listImages(db, id(req, 'product')))));
  r.post('/products/:id/images', upload.array('images', 20), wrap(async (req, res) => {
    res.status(201).json(await images.uploadImages(req.w, cfg.uploadDir, id(req, 'product'), req.files, req.body));
  }));
  r.put('/products/:id/images/order', wrap((req, res) => res.json(images.reorderImages(req.w, id(req, 'product'), req.body))));
  r.put('/images/:id', wrap((req, res) => res.json(images.updateImage(req.w, id(req, 'image'), req.body))));
  r.delete('/images/:id', wrap((req, res) => {
    images.deleteImage(req.w, id(req, 'image'));
    res.status(204).end();
  }));

  // Stock
  r.post('/variants/:id/stock', wrap((req, res) => res.status(201).json(stock.adjustStock(req.w, id(req, 'variant'), req.body))));
  r.get('/variants/:id/stock-movements', wrap((req, res) => res.json(stock.listMovements(db, id(req, 'variant'), req.query, req.lang))));

  // Discounts
  r.post('/products/:id/discounts', wrap((req, res) => res.status(201).json(discounts.createDiscounts(req.w, id(req, 'product'), req.body))));
  r.delete('/discounts/:id', wrap((req, res) => {
    res.json(discounts.deleteDiscount(req.w, id(req, 'discount'), { batch: req.query.batch === '1' }));
  }));

  // Tags
  r.get('/tags', wrap((req, res) => res.json(misc.suggestTags(db, req.query))));

  r.use((_req, _res, next) => next(notFound('route')));
  return r;
}
