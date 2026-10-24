import { FieldErrors } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { LIMITS } from '../lib/limits.js';
import { lowStockThreshold } from './settings.js';

/** Audit history of a product (grouped per save; raw rows with ?raw=1). See services/audit.js. */
export { productAudit } from './audit.js';

/**
 * Dashboard counters over non-deleted products. Low stock = the product has at least one live
 * ACTIVE variant with stock <= settings.low_stock_threshold (products.stock_min, kept by triggers).
 * One scan of the covering index idx_products_status_stock.
 */
export function productStats(db) {
  return db.stmt(
    `SELECT COUNT(*) AS total_products,
            COALESCE(SUM(status = 'active'), 0) AS active_products,
            COALESCE(SUM(status = 'inactive'), 0) AS inactive_products,
            COALESCE(SUM(stock_min <= ?), 0) AS low_stock_products
       FROM products INDEXED BY idx_products_status_stock WHERE deleted_at IS NULL`
  ).get(lowStockThreshold(db));
}

/** Tag suggestions: prefix match, most used first. */
export function suggestTags(db, query = {}) {
  const errs = new FieldErrors();
  const q = v.str(errs, 'q', query.q, { max: LIMITS.tagLength });
  const limit = v.int(errs, 'limit', query.limit, { min: 1, max: 50, def: 10 });
  errs.throwIfAny();
  const prefix = q ? `${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : '%';
  return db.stmt(
    `SELECT t.tag AS tag, COUNT(*) AS count FROM product_tags t
       JOIN products p ON p.id = t.product_id AND p.deleted_at IS NULL
      WHERE t.deleted_at IS NULL AND t.tag LIKE ? ESCAPE '\\'
      GROUP BY t.tag COLLATE NOCASE ORDER BY count DESC, t.tag LIMIT ?`
  ).all(prefix, limit);
}
