import { AppError } from '../lib/errors.js';
import { pickLang } from '../lib/i18n.js';
import { Writer } from '../lib/writer.js';
import { getSetting } from '../services/settings.js';

/** req.lang = 'id' | 'en' from ?lang=, Accept-Language, else settings.default_language, else .env DEFAULT_LANG. */
export function langMiddleware(db, cfg) {
  return (req, _res, next) => {
    const fallback = getSetting(db, 'default_language') || cfg.defaultLang;
    req.lang = pickLang(req.query.lang || req.get('accept-language'), fallback);
    next();
  };
}

/**
 * THE single place that decides who the current user is.
 * Phase 1: the seeded user (PHASE1_USERID, default admin1).
 * Phase 2: replace the body with JWT verification and load the user by token subject.
 */
export function currentUserMiddleware(db, cfg) {
  return (req, _res, next) => {
    const user = db.stmt(
      'SELECT id, userid, name, role FROM users WHERE userid = ? AND deleted_at IS NULL AND active = 1'
    ).get(cfg.phase1Userid);
    if (!user) return next(new AppError(401, 'UNAUTHENTICATED', 'not_found', { entity: 'user' }));
    req.user = user;
    req.w = new Writer(db, user);
    next();
  };
}
