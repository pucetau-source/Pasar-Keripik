# Pasar Keripik API (Phase 1)

Base `/api`, JSON. Times are **WIB strings `YYYY-MM-DD HH:MM:SS`** in and out (inputs also accept `YYYY-MM-DD HH:MM` and a `T` separator, e.g. the value of `<input type="datetime-local">`). Money = whole Rupiah integers.
Language: `Accept-Language: id|en` (or `?lang=en`); default comes from `settings.default_language`.

## Errors
```
{ "error": { "code": "VALIDATION", "message": "Ada isian yang belum benar...", "fields": { "variants[0].price": "Wajib diisi." } } }
```
- `fields` only on validation-type errors. Keys are paths into the request body: `name`, `axes[1].options[0]`, `variants[2].wholesale[1].price`, `items[0].price`, ...
- Status: 400 BAD_JSON / BAD_REQUEST (malformed URL escape such as `%E0%A4%A`), 404 NOT_FOUND (also for any bad `/uploads/...` path: missing file, `..` traversal, malformed escape — never a 500 or stack trace), 409 business conflict (CATEGORY_HAS_CHILDREN, CATEGORY_HAS_PRODUCTS, UNIT_IN_USE, DISCOUNT_OVERLAP, STOCK_NEGATIVE, SKU_TAKEN), 413 IMAGE_TOO_LARGE, 415 IMAGE_TYPE, 422 VALIDATION / IMAGE_TOO_MANY / IMAGE_UNREADABLE, 500 INTERNAL.
- Show `error.message` as the banner and `error.fields[path]` inline.

## Paged lists
`{ items: [...], total, page, page_size }` (default page_size 20, max 100).

## Me / settings
- `GET /me` -> `{ id, userid, name, role }`
- `GET /settings` ->
  ```
  { shop_name, default_language, max_images_per_product, sku_prefix,
    stock_reasons: string[],                                   // stored values, e.g. ["restock","damaged",...]
    stock_reason_options: [{ value, label }],                  // same list, label in the request language
    stock_reason_labels: { [value]: { id, en } } }             // every stored reason + system reasons 'initial', 'sale'
  ```
  Built-in labels: restock = Tambah stok / Restock, adjustment = Penyesuaian / Adjustment, stock_opname = Stok opname / Stock count, damaged = Rusak / Damaged, expired = Kedaluwarsa / Expired, return = Retur / Return, initial = Stok awal / Initial stock, sale = Penjualan / Sale. Custom reasons are shown as typed.
- `PUT /settings` body: any subset of the existing keys -> same shape. `stock_reason_options` / `stock_reason_labels` are read-only and ignored. *(extra endpoint)*

## Limits (same as the admin UI `maxLength`s)
Product name 120, description 3000, category name 80, unit name 50, unit symbol 8, tag 40, variation name 40, option 40, SKU 60, barcode 40, stock reason 80, stock note 200 (characters). Prices (variant, wholesale, discount) are whole Rupiah **>= 1**; 0 is rejected with `"Harga minimal Rp1."` / `"Price must be at least Rp1."`.

## Categories
- `GET /categories` -> tree: `[{ id, parent_id, name, position, product_count, children: [...] }]` (sorted by position)
- `GET /categories?flat=1` -> `[{ id, parent_id, name, position, depth, path: "Keripik > Singkong", product_count, child_count }]` (pre-order; handy for pickers)
- `POST /categories` `{ name, parent_id?: id|null, position?: int }` -> 201 category row
- `PUT /categories/:id` `{ name?, parent_id?: id|null, position?: int }` -> category row. Rename, move (parent_id) and reorder (position = 0-based index among siblings; siblings are renumbered).
- `DELETE /categories/:id` -> 204; 409 with a clear message if it has children or products.

## Units
- `GET /units` -> `[{ id, name, symbol, to_base, position, used_count, created_at, updated_at }]`
- `POST /units` `{ name, symbol, to_base (>0, grams per unit), position? }` -> 201
- `PUT /units/:id` same fields (partial ok). Changing `to_base` recomputes `weight_grams` of all variants using it.
- `DELETE /units/:id` -> 204; 409 UNIT_IN_USE when variants use it.

## Products
### List
`GET /products?q=&category_id=&status=active|inactive&page=&page_size=&sort=`
- `sort`: `newest` (default) | `oldest` | `updated` | `name_asc` | `name_desc` | `price_asc` | `price_desc` | `stock_asc` | `stock_desc`
- `q` matches name (contains), tags (prefix), SKU/barcode (exact). `category_id` includes descendants.
```
items: [{ id, name, status, category_id, category_name, price_min, price_max,
          effective_price_min, effective_price_max, has_discount, stock_total, variant_count,
          preorder, cover_thumb_url|null, created_at, updated_at }]
```
`price_*` are over active variants; `effective_*` include a discount running now (WIB).

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
- `DELETE /products/:id` -> 204 (soft delete; its variants/tags/discounts are soft-deleted too).

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
