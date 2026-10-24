// Bilingual (id/en) human-readable API messages.
// Usage: t('en', 'too_long', { max: 255 })
import { formatWib, formatWibRange } from './time.js';

const ENTITY = {
  id: {
    product: 'Produk', category: 'Kategori', unit: 'Satuan', variant: 'Varian', image: 'Foto',
    discount: 'Diskon', setting: 'Pengaturan', user: 'Pengguna', route: 'Alamat API',
  },
  en: {
    product: 'Product', category: 'Category', unit: 'Unit', variant: 'Variant', image: 'Photo',
    discount: 'Discount', setting: 'Setting', user: 'User', route: 'API route',
  },
};

const M = {
  id: {
    validation_failed: 'Ada isian yang belum benar. Periksa kolom yang ditandai.',
    required: 'Wajib diisi.',
    too_long: 'Maksimal {max} karakter.',
    must_be_text: 'Harus berupa teks.',
    must_be_int: 'Harus berupa bilangan bulat.',
    must_be_number: 'Harus berupa angka.',
    must_be_bool: 'Harus ya atau tidak.',
    must_be_list: 'Harus berupa daftar.',
    min_value: 'Minimal {min}.',
    max_value: 'Maksimal {max}.',
    must_be_positive: 'Harus lebih dari 0.',
    one_of: 'Pilih salah satu: {values}.',
    datetime_format: 'Format waktu harus TTTT-BB-HH JJ:MM (WIB).',
    not_found: '{entity} tidak ditemukan.',
    bad_json: 'Data yang dikirim tidak bisa dibaca (JSON tidak valid).',
    payload_too_large: 'Data yang dikirim terlalu besar.',
    internal: 'Terjadi kesalahan di server. Coba lagi sebentar lagi.',
    hard_delete_forbidden: 'Data tidak boleh dihapus permanen.',

    category_not_found: 'Kategori tidak ditemukan atau sudah dihapus.',
    category_parent_not_found: 'Kategori induk tidak ditemukan.',
    category_name_taken: 'Sudah ada kategori bernama "{name}" di tingkat yang sama.',
    category_cycle: 'Kategori tidak bisa dipindah ke dalam dirinya sendiri atau sub-kategorinya.',
    category_has_children: 'Kategori "{name}" masih punya {count} sub-kategori. Pindahkan atau hapus sub-kategori dulu.',
    category_has_products: 'Kategori "{name}" masih dipakai {count} produk. Pindahkan produk ke kategori lain dulu.',

    unit_symbol_taken: 'Simbol satuan "{symbol}" sudah dipakai.',
    unit_name_taken: 'Nama satuan "{name}" sudah dipakai.',
    unit_in_use: 'Satuan "{name}" masih dipakai {count} varian produk, jadi tidak bisa dihapus.',
    unit_not_found: 'Satuan tidak ditemukan.',

    preorder_days_required: 'Isi lama pre-order (hari).',
    tag_duplicate: 'Tag "{tag}" ditulis lebih dari sekali.',
    too_many: 'Maksimal {max} item.',
    axes_max: 'Maksimal {max} jenis variasi.',
    axis_name_duplicate: 'Nama variasi "{name}" dipakai lebih dari sekali.',
    options_required: 'Tambahkan minimal satu pilihan.',
    option_duplicate: 'Pilihan "{value}" ditulis lebih dari sekali.',
    variants_required: 'Produk harus punya minimal satu varian.',
    single_variant_only: 'Produk tanpa variasi harus punya tepat satu varian.',
    variant_options_count: 'Varian harus punya tepat {count} pilihan (satu per variasi).',
    variant_option_unknown: 'Pilihan "{value}" tidak ada di variasi "{axis}".',
    variant_combo_duplicate: 'Kombinasi "{combo}" muncul lebih dari sekali.',
    variant_not_in_product: 'Varian ini bukan milik produk ini.',
    axes_variants_together: 'Variasi dan daftar varian harus dikirim bersamaan.',
    sku_taken: 'SKU "{sku}" sudah dipakai produk lain.',
    sku_duplicate: 'SKU "{sku}" dipakai lebih dari sekali di produk ini.',
    barcode_taken: 'Barcode "{barcode}" sudah dipakai produk lain.',
    barcode_duplicate: 'Barcode "{barcode}" dipakai lebih dari sekali di produk ini.',
    weight_required: 'Isi berat dan satuannya.',

    wholesale_min_qty: 'Jumlah minimum grosir harus minimal {min}.',
    wholesale_qty_increasing: 'Jumlah minimum tiap tingkat grosir harus naik (lebih besar dari tingkat sebelumnya).',
    wholesale_price_lower: 'Harga grosir harus lebih murah dari harga normal (Rp{price}).',
    wholesale_price_decreasing: 'Harga grosir harus makin murah di tingkat berikutnya.',

    discount_range: 'Waktu mulai harus sebelum waktu selesai.',
    discount_ended: 'Waktu selesai diskon sudah lewat.',
    discount_price_lower: 'Harga diskon harus lebih murah dari harga normal (Rp{price}).',
    discount_overlap: 'Periode diskon bertabrakan dengan diskon lain untuk varian ini ({range}).',
    discount_overlap_any: 'Periode diskon bertabrakan dengan diskon lain untuk varian ini.',
    price_min: 'Harga minimal Rp1.',
    discount_price_min: 'Harga diskon minimal Rp1 (persen terlalu besar untuk harga Rp{price}).',
    bad_request: 'Alamat atau data permintaan tidak valid.',
    discount_price_or_percent: 'Isi harga diskon atau persen diskon (pilih salah satu).',
    discount_price_conflict: 'Harga varian tidak boleh di bawah/sama dengan diskon aktif atau terjadwal (Rp{price}).',
    discount_no_variants: 'Tidak ada varian untuk diberi diskon.',

    stock_negative: 'Stok tidak boleh kurang dari 0.',
    stock_source_rule: 'Kasir/toko online hanya boleh mengurangi stok karena penjualan.',
    stock_zero: 'Jumlah perubahan stok tidak boleh 0.',
    stock_direct_update: 'Stok hanya boleh diubah lewat pergerakan stok.',
    stock_qty_or_set: 'Isi jumlah perubahan atau stok akhir (pilih salah satu).',
    stock_unchanged: 'Stok akhir sama dengan stok sekarang, tidak ada yang diubah.',

    image_type: 'File "{file}" bukan gambar JPG, PNG, atau WEBP.',
    image_too_large: 'Ukuran foto maksimal {max} MB per file.',
    image_too_many: 'Maksimal {max} foto per produk (sekarang {count}).',
    image_required: 'Pilih minimal satu foto.',
    image_unreadable: 'File "{file}" tidak bisa dibaca sebagai gambar.',
    image_order_mismatch: 'Urutan foto harus berisi semua foto produk ini, masing-masing sekali.',
    variant_not_found_for_image: 'Varian untuk foto ini tidak ditemukan di produk ini.',
  },
  en: {
    validation_failed: 'Some fields are not valid. Please check the highlighted fields.',
    required: 'This field is required.',
    too_long: 'At most {max} characters.',
    must_be_text: 'Must be text.',
    must_be_int: 'Must be a whole number.',
    must_be_number: 'Must be a number.',
    must_be_bool: 'Must be yes or no.',
    must_be_list: 'Must be a list.',
    min_value: 'Must be at least {min}.',
    max_value: 'Must be at most {max}.',
    must_be_positive: 'Must be greater than 0.',
    one_of: 'Choose one of: {values}.',
    datetime_format: 'Time must be YYYY-MM-DD HH:MM (WIB).',
    not_found: '{entity} not found.',
    bad_json: 'The request body could not be read (invalid JSON).',
    payload_too_large: 'The request is too large.',
    internal: 'Something went wrong on the server. Please try again shortly.',
    hard_delete_forbidden: 'Records may not be permanently deleted.',

    category_not_found: 'Category not found or already deleted.',
    category_parent_not_found: 'Parent category not found.',
    category_name_taken: 'A category named "{name}" already exists at this level.',
    category_cycle: 'A category cannot be moved into itself or one of its sub-categories.',
    category_has_children: 'Category "{name}" still has {count} sub-categories. Move or delete them first.',
    category_has_products: 'Category "{name}" is still used by {count} products. Move those products to another category first.',

    unit_symbol_taken: 'Unit symbol "{symbol}" is already used.',
    unit_name_taken: 'Unit name "{name}" is already used.',
    unit_in_use: 'Unit "{name}" is still used by {count} product variants, so it cannot be deleted.',
    unit_not_found: 'Unit not found.',

    preorder_days_required: 'Enter the pre-order time (days).',
    tag_duplicate: 'Tag "{tag}" is listed more than once.',
    too_many: 'At most {max} items.',
    axes_max: 'At most {max} variation types.',
    axis_name_duplicate: 'Variation name "{name}" is used more than once.',
    options_required: 'Add at least one option.',
    option_duplicate: 'Option "{value}" is listed more than once.',
    variants_required: 'A product needs at least one variant.',
    single_variant_only: 'A product without variations must have exactly one variant.',
    variant_options_count: 'Each variant needs exactly {count} options (one per variation).',
    variant_option_unknown: 'Option "{value}" does not exist in variation "{axis}".',
    variant_combo_duplicate: 'Combination "{combo}" appears more than once.',
    variant_not_in_product: 'This variant does not belong to this product.',
    axes_variants_together: 'Variations and the variant list must be sent together.',
    sku_taken: 'SKU "{sku}" is already used by another product.',
    sku_duplicate: 'SKU "{sku}" is used more than once in this product.',
    barcode_taken: 'Barcode "{barcode}" is already used by another product.',
    barcode_duplicate: 'Barcode "{barcode}" is used more than once in this product.',
    weight_required: 'Enter the weight and its unit.',

    wholesale_min_qty: 'Wholesale minimum quantity must be at least {min}.',
    wholesale_qty_increasing: 'Each wholesale tier needs a higher minimum quantity than the previous one.',
    wholesale_price_lower: 'Wholesale price must be lower than the normal price (Rp{price}).',
    wholesale_price_decreasing: 'Each higher wholesale tier must have a lower price.',

    discount_range: 'Start time must be before end time.',
    discount_ended: 'The discount end time is already in the past.',
    discount_price_lower: 'Discount price must be lower than the normal price (Rp{price}).',
    discount_overlap: 'The discount period overlaps another discount for this variant ({range}).',
    discount_overlap_any: 'The discount period overlaps another discount for this variant.',
    price_min: 'Price must be at least Rp1.',
    discount_price_min: 'Discount price must be at least Rp1 (the percent is too high for a price of Rp{price}).',
    bad_request: 'The request address or data is not valid.',
    discount_price_or_percent: 'Enter either a discount price or a discount percent (one of them).',
    discount_price_conflict: 'Variant price cannot be at or below an active or scheduled discount (Rp{price}).',
    discount_no_variants: 'There are no variants to discount.',

    stock_negative: 'Stock cannot go below 0.',
    stock_source_rule: 'POS / online store may only reduce stock for a sale.',
    stock_zero: 'Stock change cannot be 0.',
    stock_direct_update: 'Stock may only change through stock movements.',
    stock_qty_or_set: 'Enter either a change amount or the final stock (one of them).',
    stock_unchanged: 'Final stock equals current stock; nothing changed.',

    image_type: 'File "{file}" is not a JPG, PNG or WEBP image.',
    image_too_large: 'Each photo can be at most {max} MB.',
    image_too_many: 'At most {max} photos per product (currently {count}).',
    image_required: 'Choose at least one photo.',
    image_unreadable: 'File "{file}" could not be read as an image.',
    image_order_mismatch: 'The photo order must list every photo of this product exactly once.',
    variant_not_found_for_image: 'The variant for this photo was not found in this product.',
  },
};

export const LANGS = ['id', 'en'];

/** Labels for the built-in stock reasons (seeded in settings.stock_reasons) + system reasons. */
export const STOCK_REASON_LABELS = {
  restock: { id: 'Tambah stok', en: 'Restock' },
  adjustment: { id: 'Penyesuaian', en: 'Adjustment' },
  stock_opname: { id: 'Stok opname', en: 'Stock count' },
  damaged: { id: 'Rusak', en: 'Damaged' },
  expired: { id: 'Kedaluwarsa', en: 'Expired' },
  return: { id: 'Retur', en: 'Return' },
  initial: { id: 'Stok awal', en: 'Initial stock' },
  sale: { id: 'Penjualan', en: 'Sale' },
};

/** Human label of a stock reason; custom (free-text) reasons are returned as typed. */
export function stockReasonLabel(reason, lang = 'id') {
  const l = STOCK_REASON_LABELS[reason];
  return l ? (l[lang] || l.id) : reason;
}

export function t(lang, key, params = {}) {
  const dict = M[lang] || M.id;
  let msg = dict[key] ?? M.en[key] ?? key;
  const p = { ...params };
  if (p.entity && ENTITY[lang]?.[p.entity]) p.entity = ENTITY[lang][p.entity];
  // Language-dependent params: { wibRange: [startsAt, endsAt] } | { wib: at }
  for (const [k, val] of Object.entries(p)) {
    if (val && typeof val === 'object') {
      if (Array.isArray(val.wibRange)) p[k] = formatWibRange(val.wibRange[0], val.wibRange[1], lang);
      else if (typeof val.wib === 'string') p[k] = formatWib(val.wib, lang, { suffix: true });
    }
  }
  return msg.replace(/\{(\w+)\}/g, (_, k) => (p[k] === undefined ? `{${k}}` : String(p[k])));
}

export function hasKey(key) {
  return key in M.id;
}

/** Pick 'id' | 'en' from an Accept-Language header, else fallback. */
export function pickLang(header, fallback = 'id') {
  if (!header) return fallback;
  const parts = String(header).toLowerCase().split(',').map((s) => s.trim().split(';')[0]);
  for (const p of parts) {
    const base = p.split('-')[0];
    if (LANGS.includes(base)) return base;
  }
  return fallback;
}
