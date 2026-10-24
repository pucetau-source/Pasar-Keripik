-- Pasar Keripik schema v1.
-- All timestamps are WIB text 'YYYY-MM-DD HH:MM:SS' (datetime('now','+7 hours')). Never UTC.
-- Money is whole Rupiah INTEGER. Soft delete only (deleted_at); hard DELETE is blocked by triggers.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  userid        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin','admin')),
  password_hash TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at    TEXT
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  parent_id  INTEGER REFERENCES categories(id),
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX uq_categories_parent_name ON categories (COALESCE(parent_id, 0), name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_parent ON categories (parent_id, position) WHERE deleted_at IS NULL;

CREATE TABLE units (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  symbol     TEXT NOT NULL,
  to_base    REAL NOT NULL CHECK (to_base > 0),
  position   INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX uq_units_symbol ON units (symbol COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_units_name ON units (name COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE TABLE products (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  category_id   INTEGER REFERENCES categories(id),
  condition     TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used')),
  preorder      INTEGER NOT NULL DEFAULT 0 CHECK (preorder IN (0,1)),
  preorder_days INTEGER,
  min_purchase  INTEGER NOT NULL DEFAULT 1 CHECK (min_purchase >= 1),
  length_cm     REAL,
  width_cm      REAL,
  height_cm     REAL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  -- Denormalized aggregates maintained by triggers on product_variants (fast list/sort).
  price_min     INTEGER,
  price_max     INTEGER,
  stock_total   INTEGER NOT NULL DEFAULT 0,
  variant_count INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at    TEXT
);
CREATE INDEX idx_products_category ON products (category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_name ON products (name COLLATE NOCASE, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_updated ON products (updated_at, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_created ON products (created_at, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_price ON products (price_min, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_stock ON products (stock_total, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_status ON products (status) WHERE deleted_at IS NULL;

CREATE TABLE product_axes (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE INDEX idx_axes_product ON product_axes (product_id, position) WHERE deleted_at IS NULL;

CREATE TABLE axis_options (
  id         INTEGER PRIMARY KEY,
  axis_id    INTEGER NOT NULL REFERENCES product_axes(id),
  value      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE INDEX idx_options_axis ON axis_options (axis_id, position) WHERE deleted_at IS NULL;

CREATE TABLE product_variants (
  id               INTEGER PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  sku              TEXT NOT NULL,
  barcode          TEXT,
  price            INTEGER NOT NULL CHECK (price >= 0),
  stock            INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight_value     REAL,
  weight_unit_id   INTEGER REFERENCES units(id),
  weight_grams     REAL,
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  position         INTEGER NOT NULL DEFAULT 0,
  last_movement_id INTEGER,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by       INTEGER REFERENCES users(id),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at       TEXT
);
CREATE INDEX idx_variants_product ON product_variants (product_id, position) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_variants_sku ON product_variants (sku COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_variants_barcode ON product_variants (barcode) WHERE deleted_at IS NULL AND barcode IS NOT NULL;
CREATE INDEX idx_variants_unit ON product_variants (weight_unit_id) WHERE deleted_at IS NULL;

CREATE TABLE variant_options (
  id         INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  option_id  INTEGER NOT NULL REFERENCES axis_options(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX uq_variant_options ON variant_options (variant_id, option_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_variant_options_option ON variant_options (option_id) WHERE deleted_at IS NULL;

CREATE TABLE wholesale_tiers (
  id         INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  min_qty    INTEGER NOT NULL CHECK (min_qty >= 2),
  price      INTEGER NOT NULL CHECK (price > 0),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE INDEX idx_wholesale_variant ON wholesale_tiers (variant_id, min_qty) WHERE deleted_at IS NULL;

CREATE TABLE discounts (
  id         INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  price      INTEGER NOT NULL CHECK (price >= 0),
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  batch_id   TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT,
  CHECK (starts_at < ends_at)
);
CREATE INDEX idx_discounts_variant ON discounts (variant_id, starts_at, ends_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_discounts_batch ON discounts (batch_id) WHERE deleted_at IS NULL;

CREATE TABLE product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),
  file       TEXT NOT NULL,
  thumb      TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  position   INTEGER NOT NULL DEFAULT 0,
  is_cover   INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0,1)),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE INDEX idx_images_product ON product_images (product_id, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_images_cover ON product_images (product_id) WHERE deleted_at IS NULL AND is_cover = 1;

CREATE TABLE product_tags (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  tag        TEXT NOT NULL COLLATE NOCASE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE INDEX idx_tags_tag ON product_tags (tag COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_tags_product_tag ON product_tags (product_id, tag COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE TABLE stock_movements (
  id         INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  qty_change INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('admin','pos','web')),
  ref        TEXT,
  note       TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  deleted_at TEXT
);
CREATE INDEX idx_movements_variant ON stock_movements (variant_id, id);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  at          TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  user_id     INTEGER REFERENCES users(id),
  table_name  TEXT NOT NULL,
  record_id   INTEGER,
  product_id  INTEGER,
  action      TEXT NOT NULL CHECK (action IN ('create','update','delete')),
  before_json TEXT,
  after_json  TEXT
);
CREATE INDEX idx_audit_product ON audit_log (product_id, id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_audit_record ON audit_log (table_name, record_id);

-- ---------------------------------------------------------------------------
-- Effective price (WIB): discount price when now (WIB) is inside [starts_at, ends_at), else normal price.
CREATE VIEW v_variant_price AS
SELECT
  v.id         AS variant_id,
  v.product_id AS product_id,
  v.active     AS active,
  v.price      AS price,
  d.id         AS discount_id,
  d.price      AS discount_price,
  d.starts_at  AS discount_starts_at,
  d.ends_at    AS discount_ends_at,
  CASE WHEN d.id IS NOT NULL AND d.price < v.price THEN d.price ELSE v.price END AS effective_price
FROM product_variants v
LEFT JOIN discounts d ON d.id = (
  SELECT d2.id FROM discounts d2
  WHERE d2.variant_id = v.id AND d2.deleted_at IS NULL
    AND d2.starts_at <= datetime('now','+7 hours')
    AND d2.ends_at   >  datetime('now','+7 hours')
  ORDER BY d2.starts_at DESC LIMIT 1
)
WHERE v.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Product aggregates (price range over active variants, total stock, variant count).
CREATE TRIGGER trg_variants_agg_ins AFTER INSERT ON product_variants
BEGIN
  UPDATE products SET
    price_min     = (SELECT MIN(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    price_max     = (SELECT MAX(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    stock_total   = (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL),
    variant_count = (SELECT COUNT(*) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL)
  WHERE id = NEW.product_id;
END;

CREATE TRIGGER trg_variants_agg_upd AFTER UPDATE OF price, stock, active, deleted_at ON product_variants
BEGIN
  UPDATE products SET
    price_min     = (SELECT MIN(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    price_max     = (SELECT MAX(price) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL AND active = 1),
    stock_total   = (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL),
    variant_count = (SELECT COUNT(*) FROM product_variants WHERE product_id = NEW.product_id AND deleted_at IS NULL)
  WHERE id = NEW.product_id;
END;

-- ---------------------------------------------------------------------------
-- Stock rules. product_variants.stock changes ONLY through stock_movements.
CREATE TRIGGER trg_variants_stock_initial BEFORE INSERT ON product_variants
WHEN NEW.stock <> 0
BEGIN
  SELECT RAISE(ABORT, 'STOCK_INITIAL_NONZERO');
END;

CREATE TRIGGER trg_variants_stock_guard BEFORE UPDATE OF stock ON product_variants
WHEN NEW.stock IS NOT OLD.stock AND (
  NEW.last_movement_id IS NULL
  OR NEW.last_movement_id IS OLD.last_movement_id
  OR (OLD.last_movement_id IS NOT NULL AND NEW.last_movement_id <= OLD.last_movement_id)
  OR NEW.stock IS NOT OLD.stock + (SELECT qty_change FROM stock_movements WHERE id = NEW.last_movement_id AND variant_id = NEW.id)
)
BEGIN
  SELECT RAISE(ABORT, 'STOCK_DIRECT_UPDATE');
END;

CREATE TRIGGER trg_movements_rules BEFORE INSERT ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'STOCK_ZERO') WHERE NEW.qty_change = 0;
  SELECT RAISE(ABORT, 'STOCK_SOURCE_RULE') WHERE NEW.source <> 'admin' AND (NEW.qty_change >= 0 OR NEW.reason <> 'sale');
  SELECT RAISE(ABORT, 'STOCK_VARIANT_MISSING')
    WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE id = NEW.variant_id AND deleted_at IS NULL);
  SELECT RAISE(ABORT, 'STOCK_NEGATIVE')
    WHERE (SELECT stock FROM product_variants WHERE id = NEW.variant_id) + NEW.qty_change < 0;
END;

CREATE TRIGGER trg_movements_apply AFTER INSERT ON stock_movements
BEGIN
  UPDATE product_variants
     SET stock = stock + NEW.qty_change, last_movement_id = NEW.id
   WHERE id = NEW.variant_id;
END;

CREATE TRIGGER trg_movements_immutable BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'STOCK_DIRECT_UPDATE');
END;

-- ---------------------------------------------------------------------------
-- Discount rules (safety net; the API validates first with friendly messages).
CREATE TRIGGER trg_discounts_ins BEFORE INSERT ON discounts
BEGIN
  SELECT RAISE(ABORT, 'DISCOUNT_RANGE') WHERE NEW.starts_at >= NEW.ends_at;
  SELECT RAISE(ABORT, 'DISCOUNT_PRICE')
    WHERE NEW.price >= (SELECT price FROM product_variants WHERE id = NEW.variant_id);
  SELECT RAISE(ABORT, 'DISCOUNT_OVERLAP') WHERE EXISTS (
    SELECT 1 FROM discounts
    WHERE variant_id = NEW.variant_id AND deleted_at IS NULL
      AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at
  );
END;

CREATE TRIGGER trg_discounts_upd BEFORE UPDATE OF starts_at, ends_at, price, variant_id ON discounts
WHEN NEW.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'DISCOUNT_RANGE') WHERE NEW.starts_at >= NEW.ends_at;
  SELECT RAISE(ABORT, 'DISCOUNT_OVERLAP') WHERE EXISTS (
    SELECT 1 FROM discounts
    WHERE variant_id = NEW.variant_id AND deleted_at IS NULL AND id <> NEW.id
      AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at
  );
END;

-- ---------------------------------------------------------------------------
-- Soft delete only: block hard DELETE everywhere.
CREATE TRIGGER trg_nodelete_users BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_settings BEFORE DELETE ON settings BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_categories BEFORE DELETE ON categories BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_units BEFORE DELETE ON units BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_products BEFORE DELETE ON products BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_axes BEFORE DELETE ON product_axes BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_options BEFORE DELETE ON axis_options BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_variants BEFORE DELETE ON product_variants BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_variant_options BEFORE DELETE ON variant_options BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_wholesale BEFORE DELETE ON wholesale_tiers BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_discounts BEFORE DELETE ON discounts BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_images BEFORE DELETE ON product_images BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_tags BEFORE DELETE ON product_tags BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_movements BEFORE DELETE ON stock_movements BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_nodelete_audit BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
CREATE TRIGGER trg_noupdate_audit BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'HARD_DELETE_FORBIDDEN'); END;
