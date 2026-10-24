# Pasar Keripik API (Phase 1)

Base `/api`, JSON. Times are **WIB strings `YYYY-MM-DD HH:MM:SS`** in and out (inputs also accept `YYYY-MM-DD HH:MM` and a `T` separator, e.g. the value of `<input type="datetime-local">`). Money = whole Rupiah integers.
Language: `Accept-Language: id|en` (or `?lang=en`); default comes from `settings.default_language`.

## Errors
```
{ "error": { "code": "VALIDATION", "message": "Ada isian yang belum benar...", "fields": { "variants[0].price": "Wajib diisi." } } }
```
- `fields` only on validation-type errors. Keys are paths into the request body: `name`, `axes[1].options[0]`, `variants[2].wholesale[1].price`, `items[0].price`, ...
- Status: 400 BAD_JSON / BAD_REQUEST (malformed URL escape such as `%E0%A4%A`), 404 NOT_FOUND (also for any bad `/uploads/...` path: missing file, `..` traversal, malformed escape — never a 500 or stack trace), 409 business conflict (CATEGORY_HAS_CHILDREN, CATEGORY_HAS_PRODUCTS, UNIT_IN_USE, DISCOUNT_OVERLAP, STOCK_NEGATIVE, SKU_TAKEN, FOLDER_BUSY), 413 IMAGE_TOO_LARGE, 415 IMAGE_TYPE, 422 VALIDATION / IMAGE_TOO_MANY / IMAGE_UNREADABLE, 500 INTERNAL / FILE_MOVE_FAILED.
- Show `error.message` as the banner and `error.fields[path]` inline.

## Paged lists
`{ items: [...], total, page, page_size }` (default page_size 20, max 100).

## Me / settings
- `GET /me` -> `{ id, userid, name, role }`
- `GET /settings` ->
  ```
  { shop_name, default_language, max_images_per_product, sku_prefix,
    tagline: string|null,                                      // seed 'Renyahnya, selalu bikin happy' (max 120)
    low_stock_threshold: int,                                  // seed 10, >= 0 (returned as a number)
    logo_file: string|null,                                    // file name in UPLOAD_DIR, null = default icon
    logo_url: '/uploads/logo-<uuid>.webp' | null,              // derived from logo_file
    stock_reasons: string[],                                   // stored values, e.g. ["restock","damaged",...]
    stock_reason_options: [{ value, label }],                  // same list, label in the request language
    stock_reason_labels: { [value]: { id, en } } }             // every stored reason + system reasons 'initial', 'sale'
  ```
  Built-in labels: restock = Tambah stok / Restock, adjustment = Penyesuaian / Adjustment, stock_opname = Stok opname / Stock count, damaged = Rusak / Damaged, expired = Kedaluwarsa / Expired, return = Retur / Return, initial = Stok awal / Initial stock, sale = Penjualan / Sale. Custom reasons are shown as typed.
- `PUT /settings` body: any subset of the existing keys -> same shape. `logo_url` / `stock_reason_options` / `stock_reason_labels` are read-only and ignored. `low_stock_threshold` must be an integer >= 0. `logo_file` accepts only `null`/`''` (removes the logo, same as `DELETE /settings/logo`) or its current value (no-op); anything else -> 422 `fields.logo_file`. Every changed key is audited (`audit_log.table_name = 'settings'`). *(extra endpoint)*
- `POST /settings/logo` multipart, single field `logo`. JPG/PNG/WEBP only (SVG is always rejected, also when disguised with another MIME type: the content is sniffed), max **2 MB**. Re-encoded to WEBP, max 256 px (no enlargement, transparency kept), stored in `UPLOAD_DIR`; the previous logo file is deleted. -> 200 settings (same shape as `GET /settings`). Errors: 415 IMAGE_TYPE, 413 IMAGE_TOO_LARGE (`max 2 MB`), 422 IMAGE_UNREADABLE, 422 VALIDATION `fields.logo` (no file). Audited.
- `DELETE /settings/logo` -> 200 settings with `logo_file: null, logo_url: null` (file deleted; idempotent). Audited.

## Stats
`GET /stats` -> `{ total_products, active_products, inactive_products, low_stock_products }` (integers, non-deleted products).
Low stock = the product has **at least one active variant** with `stock <= settings.low_stock_threshold` (inactive variants are ignored; inactive products are counted). One scan of a covering index (`products.stock_min`, kept by triggers); p95 ~2 ms over HTTP at 10k products.

## Limits (same as the admin UI `maxLength`s)
Product name 120, description 3000, category name 80, unit name 50, unit symbol 8, tag 40, variation name 40, option 40, SKU 60, barcode 40, stock reason 80, stock note 200 (characters). Prices (variant, wholesale, discount) are whole Rupiah **>= 1**; 0 is rejected with `"Harga minimal Rp1."` / `"Price must be at least Rp1."`.

## Categories
- `GET /categories` -> tree: `[{ id, parent_id, name, position, folder, product_count, children: [...] }]` (sorted by position)
- `GET /categories?flat=1` -> `[{ id, parent_id, name, position, folder, depth, path: "Keripik > Singkong", product_count, child_count }]` (pre-order; handy for pickers)
- `POST /categories` `{ name, parent_id?: id|null, position?: int }` -> 201 category row
- `PUT /categories/:id` `{ name?, parent_id?: id|null, position?: int }` -> category row. Rename, move (parent_id) and reorder (position = 0-based index among siblings; siblings are renumbered).
- `DELETE /categories/:id` -> 204; 409 with a clear message if it has children or products.
- Category rows (POST/PUT responses) include `folder` (see below).

### Image folders (mirror the category tree)
Every category has a folder under `UPLOAD_DIR`; `categories.folder` (migration 004) stores its full relative path, e.g. `keripik/keripik-pisang`.
- Folder name = slug of the name: lowercase ascii (accents stripped), runs of anything other than `a-z0-9` -> `-`, max 60 chars. `'Keripik Pisang'` -> `keripik-pisang`. No ascii left -> `category-<id>`. Windows device names (`con`, `nul`, `com1`, ...) are never used.
- Unique among siblings: `keripik-pisang`, `keripik-pisang-2`, `keripik-pisang-3`, ... (a name that already exists on disk is never reused or overwritten).
- **Create** (any depth): folder is created (`mkdir -p`). Existing categories get folders at startup (idempotent backfill).
- **Rename / move**: when the slug or parent changes, the folder (with all sub-folders and files) is renamed on disk and `categories.folder` of the whole subtree + every `product_images` path under it are rewritten in one transaction. Same-slug renames (`'Keripik Pisang'` -> `'keripik pisang!'`) keep the folder. If a file operation fails (e.g. Windows: folder open in another program) everything is rolled back and the API answers **409 `FOLDER_BUSY`** (or 500 `FILE_MOVE_FAILED`) with a message saying nothing was changed. Old image URLs stop working (404); the API returns the new ones.
- **Delete** (soft, only when empty): the folder is renamed `<slug>-unused` (`-unused-2`, ... when taken), files are never deleted; `categories.folder` records the new name (in the same `delete` audit row). Creating a category with the same name again gets a fresh `<slug>` folder.
- The shop logo stays in the `UPLOAD_DIR` root.

## Units
- `GET /units` -> `[{ id, name, symbol, to_base, position, used_count, created_at, updated_at }]`
- `POST /units` `{ name, symbol, to_base (>0, grams per unit), position? }` -> 201
- `PUT /units/:id` same fields (partial ok). Changing `to_base` recomputes `weight_grams` of all variants using it.
- `DELETE /units/:id` -> 204; 409 UNIT_IN_USE when variants use it.

## Products
### List
`GET /products?q=&category_id=&status=active|inactive&low_stock=1&page=&page_size=&sort=`
- `low_stock=1` (or `true`): only products that are low on stock, same rule as `GET /stats` / the item `low_stock` flag (`products.stock_min <= low_stock_threshold`, via index `idx_products_status_stock`). `0`/`false`/absent = no filter; anything else -> 422 `fields.low_stock`. Combines with every other filter.
- `sort`: `newest` (default) | `oldest` | `updated` | `name_asc` | `name_desc` | `price_asc` | `price_desc` | `stock_asc` | `stock_desc`
- `q` matches name (contains), tags (prefix), SKU/barcode (exact). `category_id` includes descendants.
```
items: [{ id, name, status, category_id, category_name, price_min, price_max,
          effective_price_min, effective_price_max, has_discount, stock_total, variant_count,
          preorder, low_stock: bool, cover_thumb_url|null, created_at, updated_at }]
```
`price_*` are over active variants; `effective_*` include a discount running now (WIB). `low_stock` uses the same rule as `GET /stats` (any active variant with stock <= `low_stock_threshold`).

### Detail
`GET /products/:id`
```
{ id, name, description, category_id, category_path: [{id,name}], condition: 'new'|'used',
  preorder: bool, preorder_days, min_purchase, length_cm, width_cm, height_cm, status,
  price_min, price_max, stock_total, variant_count,
  created_at, created_by: {id,userid,name}, updated_at, updated_by: {...},
  tags: string[],
  axes: [{ id, name, position, options: [{ id, value, position }] }],
  variants: [{ id, option_ids: [..], option_values: ["Pedas","250 g"], sku, barcode, price, stock,
               weight_value, weight_unit_id, weight_unit_symbol, weight_grams, active: bool, position,
               effective_price, active_discount: {id,price,starts_at,ends_at}|null,
               wholesale: [{ id, min_qty, price }] }],
  discounts: [{ id, variant_id, price, starts_at, ends_at, batch_id, created_at, state: 'active'|'scheduled'|'ended' }],
  images: [{ id, variant_id, position, is_cover: bool, width, height, url, thumb_url }] }
```

### Create / update
`POST /products` -> 201 detail. `PUT /products/:id` -> detail.
```
{ name, description?, category_id, condition?: 'new'|'used', status?: 'active'|'inactive',
  preorder?: bool, preorder_days? (required when preorder), min_purchase?: int>=1,
  length_cm?, width_cm?, height_cm?,
  tags?: string[] (max 20, de-duplicated case-insensitively),
  axes: [{ id?, name, options: ["Pedas", "Original"] | [{ id?, value }] }],   // 0..3 axes
  variants: [{ id?, option_values: ["Pedas"],   // one value per axis, in axis order; [] when no axes
               sku? (blank = auto `<sku_prefix><productId>-<n>`), barcode?,
               price, stock? (only used for NEW variants: becomes an 'initial' stock movement),
               weight_value, weight_unit_id, active?: bool,
               wholesale?: [{ min_qty, price }] }] }
```
Rules:
- No axes -> exactly one variant with `option_values: []`. With axes -> each variant has one value per axis; combinations must be unique. The full cartesian product is **not** required (the UI should generate it; unwanted combos can be `active:false` or omitted).
- `sku` unique (case-insensitive) across live variants; `barcode` unique when present.
- Wholesale tiers, in the order sent: `min_qty` >= max(2, min_purchase+1) and strictly increasing; `price` < variant price and strictly decreasing.
- `weight_grams = weight_value * unit.to_base` (server computed).
- PUT is partial for scalar fields and `tags`. `axes` and `variants` are a full replace and must be sent **together**. Variants are matched by `id`, else by identical option combination; matched variants keep their id and stock. Removed variants/axes/options/tiers are soft-deleted. `stock` is ignored for existing variants (use the stock endpoint).
- A variant price cannot be lowered to/below one of its active or scheduled discounts.
- Changing `category_id` moves the product's image files + thumbnails (also of removed photos) into the new category's folder and updates their paths in the same transaction (409 `FOLDER_BUSY` + full rollback on a file error).
- `DELETE /products/:id` -> 204 (soft delete; its variants/tags/discounts are soft-deleted too).

### Duplicate
`POST /products/:id/duplicate` (no body) -> 201 detail of the **new** product (same shape as `GET /products/:id`); 404 if the source is missing/deleted.
- `name` = source name + `' (salinan)'` (id) or `' (copy)'` (en, from `Accept-Language` / `?lang=`); the source part is cut so the result is at most 120 characters.
- `status: 'inactive'`; same category, description, condition, pre-order, min purchase, dimensions, tags, axes/options (same order), variants (price, weight, active, wholesale tiers).
- Variants get fresh auto SKUs (`<sku_prefix><newId>-<n>`), `barcode: null`, `stock: 0` (no stock movements). Discounts are **not** copied.
- Images: files are copied (new uuid names, into the same category folder), same order/cover; photos linked to a variant are linked to the matching new variant.
- Audit: one save on the new product, `action: 'created'`.

### Audit
`GET /products/:id/audit?page=&page_size=` (default 50, newest first; also works for deleted products).
One item per **save**: all audit rows written by the same request (same user, same second WIB, same `txn`) are one group. Texts are in the request language.
```
{ items: [{
    id,                    // last audit_log id of the group
    at,                    // 'YYYY-MM-DD HH:MM:SS' (WIB)
    at_text,               // '24 Okt 2026 21.55 WIB' | 'Oct 24, 2026 21:55 WIB'
    user: { id, userid, name } | null,
    action: 'created'|'updated'|'deleted'|'stock_changed'|'discount_added'|'discount_removed'
          |'images_added'|'images_removed'|'images_updated',
    summary,               // 'Produk diubah' | 'Product updated' ...
    changes: [{
      table, record_id,
      entity: 'product'|'variant'|'wholesale'|'discount'|'stock'|'tag'|'variation'|'option'|'image',
      kind: 'added'|'changed'|'removed',
      variant: 'Pedas / 250 g (PK12-1)' | 'PK12-1' | null,   // option values + SKU, never ids
      field: 'price'|'name'|... | null,
      label: 'Harga' | null,                                // field label in the request language
      from: 'Rp 12.000' | null, to: 'Rp 10.000' | null,     // display-formatted values
      text                                                  // 'Pedas / 250 g (PK12-1) · Harga: Rp 12.000 → Rp 10.000'
    }],
    entry_ids: [auditLogId, ...] }],
  total, page, page_size }    // total / paging count groups
```
Examples of `text`: `Nama: Keripik A → Keripik B`, `Kategori: Keripik Singkong → Kerupuk Udang`, `Pedas (PK1-1) · Stok: +10 (Tambah stok)`, `Stok: +5 (Stok awal)`, `Diskon ditambahkan: Rp 9.000, 24 Okt 2026 21.55 - 25 Okt 2026 08.00 WIB`, `Variasi ditambahkan: Rasa (Pedas, Original)`, `Tag dihapus: pedas`, `Urutan foto diubah`. The variant prefix is omitted for products without variations.

`GET /products/:id/audit?raw=1&page=&page_size=` -> the raw rows (paging counts rows):
```
items: [{ id, at, action: 'create'|'update'|'delete', table_name, record_id,
          user: {id,userid,name}, changes: [{ field, from, to }] (updates only), before, after }]
```

## Images
- `GET /products/:id/images` -> image list *(extra)*
- `POST /products/:id/images` multipart, field `images` (multiple), optional field `variant_id`. JPG/PNG/WEBP, max `MAX_UPLOAD_MB` each (default 5), max `settings.max_images_per_product` per product (default 9). Stored as WEBP (max 1600 px) + 320 px thumb. -> 201 `[image]` (the new ones). First image of a product becomes the cover.
- `PUT /products/:id/images/order` `{ order: [imageId, ...all live images], cover_id?: imageId }` -> full list. Without `cover_id` the first in `order` becomes the cover.
- `PUT /images/:id` `{ variant_id?: id|null, is_cover?: true }` -> image *(extra: link a photo to a variant / set cover)*
- `DELETE /images/:id` -> 204 (soft delete; next photo becomes cover).
- Files: `url` / `thumb_url` are served from `/uploads/...` (cached immutable).
- Storage: saved directly in the product category's folder with uuid names; the DB (`product_images.file` / `thumb`) stores the path relative to `UPLOAD_DIR` and the URL is `/uploads/<that path>`:
  `file: keripik/keripik-pisang/3f2b…-….webp` -> `url: /uploads/keripik/keripik-pisang/3f2b…-….webp`,
  `thumb: keripik/keripik-pisang/3f2b…-….thumb.webp` -> `thumb_url: /uploads/keripik/keripik-pisang/3f2b…-….thumb.webp`.
  Paths are server-generated (`[a-z0-9-]` folders + uuid names) and checked (no `..`, no absolute paths) before any disk access. Folder URLs are never listed (404). At startup, image files that are not in their product's category folder (e.g. old files in the upload root) are moved there (idempotent).

## Stock
- `POST /variants/:id/stock` `{ qty_change: int (+/-, not 0) }` **or** `{ set_to: int>=0 }`, plus `reason` (required; suggestions in `settings.stock_reasons`), `note?`, `ref?`
  -> 201 `{ movement: {id, variant_id, qty_change, reason, source:'admin', ref, note, created_at, ...}, stock }`. 409 STOCK_NEGATIVE if it would go below 0.
- `GET /variants/:id/stock-movements?page=&page_size=`
  -> `{ variant: {id, product_id, sku, stock, product_name}, items: [{ id, qty_change, stock_after, reason, reason_label, source, ref, note, created_at, created_by: {id,userid,name}|null }], total, page, page_size }` (newest first)

## Discounts
`POST /products/:id/discounts` (one of three forms; all rows of one call share a `batch_id`):
```
{ starts_at, ends_at, items: [{ variant_id, price }] }          // per-variant prices
{ starts_at, ends_at, price,   variant_ids?: [id] }             // same price; default = all variants
{ starts_at, ends_at, percent, variant_ids?: [id] }             // % off (1-99), rounded to Rupiah
```
-> 201 `{ batch_id, discounts: [{ id, variant_id, price, starts_at, ends_at, batch_id, created_at }] }`.
Rules: `starts_at < ends_at`, `ends_at` in the future, price < variant price, no overlap with another discount of the same variant (409 DISCOUNT_OVERLAP, message names the other period as `24 Okt 2026 21.55 - 25 Okt 2026 08.00 WIB` / `Oct 24, 2026 21:55 - Oct 25, 2026 08:00 WIB`; back-to-back periods are fine). Price / percent result must be >= Rp1. Active when `starts_at <= now(WIB) < ends_at`.
- `DELETE /discounts/:id` -> `{ deleted: [ids] }`; `DELETE /discounts/:id?batch=1` removes the whole batch.

## Tags
`GET /tags?q=&limit=` -> `[{ tag, count }]` (prefix match, most used first, default 10).
