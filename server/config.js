// Central config. Values come from .env (root) with safe defaults.
// WIB everywhere: force the process timezone before anything uses Date.
process.env.TZ = 'Asia/Jakarta';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

function resolveFromRoot(p) {
  return path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p);
}

export function loadConfig(overrides = {}) {
  const env = process.env;
  const cfg = {
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dbFile: resolveFromRoot(env.DB_FILE || 'data/pasar-keripik.db'),
    uploadDir: resolveFromRoot(env.UPLOAD_DIR || 'data/uploads'),
    clientDist: resolveFromRoot(env.CLIENT_DIST || 'client/dist'),
    defaultLang: (env.DEFAULT_LANG || 'id').toLowerCase() === 'en' ? 'en' : 'id',
    maxUploadMb: Number(env.MAX_UPLOAD_MB || 5),
    // Phase 1 "current user": the seeded user with this userid. Phase 2 swaps the middleware for JWT.
    phase1Userid: env.PHASE1_USERID || 'admin1',
    seedAdminUserid: env.SEED_ADMIN_USERID || 'admin1',
    seedAdminName: env.SEED_ADMIN_NAME || 'admin pasar keripik',
    seedShopName: env.SEED_SHOP_NAME || 'Pasar Keripik',
    logRequests: env.LOG_REQUESTS === '1',
    ...overrides,
  };
  if (overrides.dbFile) cfg.dbFile = resolveFromRoot(overrides.dbFile);
  if (overrides.uploadDir) cfg.uploadDir = resolveFromRoot(overrides.uploadDir);
  return cfg;
}
