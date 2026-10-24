-- products.stock_min: lowest stock over the product's live ACTIVE variants (NULL when it has none).
-- Maintained by the same aggregate triggers as stock_total; powers the "low stock" flag/count
-- (low stock = stock_min <= settings.low_stock_threshold) without touching product_variants.
ALTER TABLE products ADD COLUMN stock_min INTEGER;

UPDATE products SET stock_min = (
  SELECT MIN(stock) FROM product_variants WHERE product_id = products.id AND deleted_at IS NULL AND active = 1
);

DROP TRIGGER trg_variants_agg_ins;
CREATE TRIGGER trg_variants_agg_ins AFTER INSERT ON product_variants
BEGIN
  UPDATE products SET
    price_min     = (SELECT MIN(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    price_max     = (SELECT MAX(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    stock_min     = (SELECT MIN(stock) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    stock_total   = (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL),
    variant_count = (SELECT COUNT(*) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL)
  WHERE id = NEW.product_id;
END;

DROP TRIGGER trg_variants_agg_upd;
CREATE TRIGGER trg_variants_agg_upd AFTER UPDATE OF price, stock, active, deleted_at ON product_variants
BEGIN
  UPDATE products SET
    price_min     = (SELECT MIN(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    price_max     = (SELECT MAX(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    stock_min     = (SELECT MIN(stock) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    stock_total   = (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL),
    variant_count = (SELECT COUNT(*) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL)
  WHERE id = NEW.product_id;
END;

-- Covering index for GET /stats (one scan of a small index; also serves the status filter).
-- deleted_at is listed as a column so SQLite can treat the index as covering.
DROP INDEX idx_products_status;
CREATE INDEX idx_products_status_stock ON products (status, stock_min, deleted_at) WHERE deleted_at IS NULL;
