// Business limits (validation rules, not data). Kept in one place.
// Text limits mirror the maxLength values used by the admin UI (client/src) so the server
// enforces exactly what the form allows.
export const LIMITS = {
  productName: 120, // ProductForm name maxLength
  description: 3000, // ProductForm description maxLength
  categoryName: 80, // Categories name maxLength
  unitName: 50,
  unitSymbol: 8, // Units symbol maxLength
  maxTags: 20,
  tagLength: 40, // Pickers tag maxLength
  maxAxes: 3,
  axisName: 40, // Variations axis name maxLength
  maxOptionsPerAxis: 50,
  optionValue: 40, // Variations option maxLength
  maxVariants: 500,
  sku: 60, // Variations SKU maxLength
  barcode: 40, // Variations barcode maxLength
  minPrice: 1, // whole Rupiah; 0 is never a valid price
  maxPrice: 1_000_000_000_000,
  maxStock: 1_000_000_000,
  maxWholesaleTiers: 10,
  wholesaleMinQty: 2,
  preorderDaysMin: 1,
  preorderDaysMax: 365,
  stockReason: 80, // StockDialog reason maxLength
  note: 200, // StockDialog note maxLength
  pageSizeDefault: 20,
  pageSizeMax: 100,
  tagline: 120, // Settings tagline
};
