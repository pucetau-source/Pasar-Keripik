# Pasar Keripik: Product Backend (Phase 1)

Offline store "Pasar Keripik". Admin web page to manage products. The SQLite DB is shared later by POS and an e-commerce site.
Phase 1 = product CRUD. Phase 2 = login, change password, super admin creates users.

## Hard rules
1. Nothing hardcoded: categories, units, tags, product data, user name, settings all come from the DB or `.env`.
2. Time is **WIB (Asia/Jakarta, UTC+7) everywhere**: DB, API, UI. No UTC. Store as text `YYYY-MM-DD HH:MM:SS` (WIB). Node runs with `TZ=Asia/Jakarta`. API sends/receives the same string format.
3. Money = whole Rupiah, INTEGER.
4. Soft delete only (`deleted_at`). Never hard delete.
5. Every table: `created_by, created_at, updated_by, updated_at, deleted_at`. Every write also appends to `audit_log` (who, when, table, record id, action, before/after JSON).
6. Phase 1 user is a seeded row in `users`: userid `admin1`, name `admin pasar keripik` (dummy). Phase 2 replaces it with real login. API reads "current user" from one middleware so Phase 2 is a swap.
7. Speed is priority #1: indexed queries, server-side paging, WAL mode, prepared statements, gzip, thumbnails, lazy-loaded routes, no N+1.
8. Separate project. Do not read or touch any other project on this PC.

## Stack (same family as the minimarket app)
- Backend: Node 24, Express 4, better-sqlite3, multer, compression, dotenv, sharp (thumbnails). ESM.
- Frontend: React 19, Vite, Tailwind 3, react-router-dom. Own tiny i18n (id/en, switchable, remembered in localStorage).
- One Node process serves API + built web. Docker later (volume for `data/`), Cloudflare Tunnel later.
- Layout: `server/` (backend), `client/` (frontend), `data/` (db + uploads, git-ignored), `.env.example`.

## Data model
- `users(id, userid UNIQUE, name, ...)` seeded admin1.
- `categories(id, parent_id, name, position)` tree. Unique name per parent (among non-deleted). Deleting a category that has products or children is blocked with a clear message.
- `units(id, name, symbol, to_base REAL)` admin-managed (seed g=1, kg=1000, mg=0.001). Base is grams.
- `products(id, name, description, category_id, condition('new'|'used'), preorder INTEGER, preorder_days, min_purchase, length_cm, width_cm, height_cm, status('active'|'inactive'))`.
- `product_axes(id, product_id, name, position)` max 3 per product. `axis_options(id, axis_id, value, position)`.
- `product_variants(id, product_id, sku, barcode, price, stock, weight_value, weight_unit_id, weight_grams, active)`. Every product has at least one variant. A product without axes has exactly one variant with no options. `weight_grams = weight_value * unit.to_base`, computed by the server on write. `sku` unique, `barcode` unique when present.
- `variant_options(variant_id, option_id)` links a variant to one option per axis.
- `wholesale_tiers(id, variant_id, min_qty, price)` price must be lower than the variant price and strictly decrease as min_qty rises.
- `discounts(id, variant_id, price, starts_at, ends_at, batch_id)`. Several scheduled ahead are allowed, but periods must not overlap for the same variant. Price must be lower than the variant price. `starts_at < ends_at`. A product-wide discount is created as one row per variant sharing a `batch_id`.
- `v_variant_price` (view): effective price = discount price if now (WIB) is inside a period, else normal price.
- `product_images(id, product_id, variant_id NULL, file, thumb, position, is_cover)` files in `data/uploads`.
- `product_tags(id, product_id, tag)` free-text keywords; index for search.
- `stock_movements(id, variant_id, qty_change, reason, source('admin'|'pos'|'web'), ref, note, created_by, created_at)`. `product_variants.stock` is maintained only through movements. Rule enforced in DB triggers: `source` other than `admin` may only write negative `qty_change` with reason `sale`; stock may never go below 0. Only the admin webpage adds stock.
- `audit_log(id, at, user_id, table_name, record_id, action, before_json, after_json)`.
- `settings(key, value)` for app config such as shop name and default language.

## API (JSON, prefix `/api`)
- `GET /me`
- Categories: `GET /categories` (tree), `POST`, `PUT /:id` (rename/move/reorder), `DELETE /:id`
- Units: `GET /units`, `POST`, `PUT /:id`, `DELETE /:id` (blocked if used)
- Products: `GET /products?q=&category_id=&status=&page=&page_size=&sort=` (returns price range, total stock, cover thumb; category filter includes descendants), `GET /products/:id` (full: axes, options, variants, tiers, discounts, images, tags), `POST /products`, `PUT /products/:id`, `DELETE /products/:id`
- Images: `POST /products/:id/images` (multipart, multiple), `PUT /products/:id/images/order`, `DELETE /images/:id`
- Stock: `POST /variants/:id/stock` (admin adds/adjusts with reason), `GET /variants/:id/stock-movements`
- Discounts: `POST /products/:id/discounts` (product-wide or per variant), `DELETE /discounts/:id`
- Audit: `GET /products/:id/audit`
- Tags: `GET /tags?q=` (suggestions)
- Errors: `{error:{code,message,fields?}}` with human-readable messages in the requested language (`Accept-Language: id|en`).

## Screens
1. Product list: search, category filter, status, paging, cover thumb, price range, stock, discount badge.
2. Add/Edit product (single page, Shopee-like sections): photos, name, description, category picker (tree), tags, condition, pre-order, min purchase, dimensions, variations (axes/options, variant table with SKU, barcode, price, stock, weight+unit), wholesale, discounts (date-time range, WIB).
3. Category tree manager. 4. Unit manager. 5. Product audit history. 6. Stock adjust dialog with movement history.

## UI direction
Glassmorphism, built from scratch, human-friendly: readable contrast (dark text on frosted panels), clear labels, plain wording, generous spacing, obvious primary buttons, inline validation messages, confirm before delete, empty states that explain what to do. Not generic "AI dashboard" look: no neon gradients, no emoji icons, no purple-blue glow. Warm palette fitting a keripik (snack) shop. Limit `backdrop-filter` to a few large layers; solid translucent fallback via `prefers-reduced-transparency` / `@supports not`. Works on phone, tablet, desktop. Indonesian default, English switch.

## Performance budget
First load JS <= 150 KB gzip (route-split), API p95 <= 50 ms on list/detail with 10k products, LCP <= 1.5 s on local, list page paged (default 20). Tester must measure and report.

## Out of scope (dropped from Shopee form)
GTIN, scheduled listing, share to Twitter/Facebook, dangerous goods, shipping fee/courier, insurance.
