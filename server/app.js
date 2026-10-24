import './config.js'; // sets TZ=Asia/Jakarta first
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import multer from 'multer';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { AppError, fromSqliteError, toResponse } from './lib/errors.js';
import { langMiddleware, currentUserMiddleware } from './middleware/context.js';
import { apiRouter } from './routes/api.js';

/** HTTP status carried by an http-errors style error (send/serve-static/express), else 0. */
const httpStatus = (err) => Number(err?.status || err?.statusCode) || 0;

/** Build the Express app (used by index.js and by tests with a temp DB). */
export function createApp(overrides = {}) {
  const cfg = loadConfig(overrides);
  const db = overrides.db || openDb(cfg.dbFile, {
    seed: { adminUserid: cfg.seedAdminUserid, adminName: cfg.seedAdminName, shopName: cfg.seedShopName, defaultLang: cfg.defaultLang },
  });
  fs.mkdirSync(cfg.uploadDir, { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', 'weak');
  app.use(compression({ threshold: 1024 }));

  if (cfg.logRequests) {
    app.use((req, res, next) => {
      const t0 = process.hrtime.bigint();
      res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)}ms`));
      next();
    });
  }

  // Uploaded images: file names are unique per upload, so cache forever.
  app.use('/uploads', express.static(cfg.uploadDir, { maxAge: '365d', immutable: true, index: false, fallthrough: false }));

  app.use('/api', express.json({ limit: '1mb' }), langMiddleware(db, cfg), currentUserMiddleware(db, cfg), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, apiRouter(db, cfg));

  // Built web client (client/dist) with SPA fallback, when present.
  const indexHtml = path.join(cfg.clientDist, 'index.html');
  app.use(express.static(cfg.clientDist, {
    index: false,
    setHeaders: (res, file) => {
      if (/[\\/]assets[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    if (!fs.existsSync(indexHtml)) return res.status(404).type('text/plain').send('Web client not built yet (client/dist).');
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  // Errors -> {error:{code,message,fields?}} in the request language.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const lang = req.lang || cfg.defaultLang;
    let e = err;
    if (!(e instanceof AppError)) {
      if (err instanceof multer.MulterError) {
        e = err.code === 'LIMIT_FILE_SIZE'
          ? new AppError(413, 'IMAGE_TOO_LARGE', 'image_too_large', { max: cfg.maxUploadMb })
          : new AppError(422, 'UPLOAD_LIMIT', 'too_many', { max: 20 });
      } else if (err.type === 'entity.parse.failed') {
        e = new AppError(400, 'BAD_JSON', 'bad_json');
      } else if (err.type === 'entity.too.large') {
        e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'payload_too_large');
      } else if (req.path.startsWith('/uploads') && httpStatus(err) >= 400 && httpStatus(err) < 500) {
        // Static uploads: missing file, traversal attempt (403) or malformed escape (400) -> plain 404.
        e = new AppError(404, 'NOT_FOUND', 'not_found', { entity: 'image' });
      } else if (httpStatus(err) === 404 || httpStatus(err) === 403) {
        e = new AppError(404, 'NOT_FOUND', 'not_found', { entity: 'route' });
      } else if (httpStatus(err) >= 400 && httpStatus(err) < 500) {
        // e.g. URIError "Failed to decode param" (400) from a malformed %-escape
        e = new AppError(400, 'BAD_REQUEST', 'bad_request');
      } else {
        e = fromSqliteError(err);
        if (!e && err.code === 'SQLITE_CONSTRAINT_UNIQUE' && /sku/i.test(err.message)) {
          e = new AppError(409, 'SKU_TAKEN', 'sku_taken', { sku: '' });
        } else if (!e && err.code === 'SQLITE_CONSTRAINT_UNIQUE' && /barcode/i.test(err.message)) {
          e = new AppError(409, 'BARCODE_TAKEN', 'barcode_taken', { barcode: '' });
        }
      }
    }
    if (!e) {
      console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
      e = new AppError(500, 'INTERNAL', 'internal');
    }
    res.status(e.status).json(toResponse(e, lang));
  });

  return { app, db, cfg };
}
