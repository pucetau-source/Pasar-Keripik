import { getLang } from './i18n.jsx';

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status; this.code = code; this.fields = fields || null;
  }
}

async function req(path, { method = 'GET', body, form, signal } = {}) {
  const headers = { 'Accept-Language': getLang() };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: payload, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', getLang() === 'en' ? 'Cannot reach the server.' : 'Tidak dapat terhubung ke server.');
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(res.status, e.code || 'error', e.message || res.statusText, e.fields);
  }
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const k in o) if (o[k] !== '' && o[k] != null) p.set(k, o[k]);
  const s = p.toString();
  return s ? '?' + s : '';
};

let meP, settingsP;
const pre = new Map(); // one-shot prefetched GETs, consumed by the first matching call
const take = (k, fn) => { const h = pre.get(k); if (h) { pre.delete(k); return h; } return fn(); };
export const api = {
  me: () => (meP ||= req('/me')),
  prefetch: (key, fn) => { const pr = fn(); pr.catch(() => {}); pre.set(key, pr); setTimeout(() => pre.delete(key), 5000); },
  categories: () => take('categories', () => req('/categories')),
  createCategory: (b) => req('/categories', { method: 'POST', body: b }),
  updateCategory: (id, b) => req(`/categories/${id}`, { method: 'PUT', body: b }),
  deleteCategory: (id) => req(`/categories/${id}`, { method: 'DELETE' }),
  units: () => req('/units'),
  createUnit: (b) => req('/units', { method: 'POST', body: b }),
  updateUnit: (id, b) => req(`/units/${id}`, { method: 'PUT', body: b }),
  deleteUnit: (id) => req(`/units/${id}`, { method: 'DELETE' }),
  products: (params, signal) => take('products' + qs(params), () => req('/products' + qs(params), { signal })),
  product: (id) => req(`/products/${id}`),
  createProduct: (b) => req('/products', { method: 'POST', body: b }),
  updateProduct: (id, b) => req(`/products/${id}`, { method: 'PUT', body: b }),
  deleteProduct: (id) => req(`/products/${id}`, { method: 'DELETE' }),
  uploadImages: (id, files) => {
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    return req(`/products/${id}/images`, { method: 'POST', form });
  },
  orderImages: (id, ids) => req(`/products/${id}/images/order`, { method: 'PUT', body: { order: ids, cover_id: ids[0] } }),
  deleteImage: (id) => req(`/images/${id}`, { method: 'DELETE' }),
  adjustStock: (vid, b) => req(`/variants/${vid}/stock`, { method: 'POST', body: b }),
  stockMovements: (vid) => req(`/variants/${vid}/stock-movements`),
  addDiscount: (pid, b) => req(`/products/${pid}/discounts`, { method: 'POST', body: b }),
  deleteDiscount: (id, batch) => req(`/discounts/${id}${batch ? '?batch=1' : ''}`, { method: 'DELETE' }),
  settings: () => (settingsP ||= req('/settings').catch((e) => { settingsP = null; throw e; })),
  updateSettings: (b) => req('/settings', { method: 'PUT', body: b }).then((d) => { settingsP = Promise.resolve(d); return d; }),
  uploadLogo: (file) => { const form = new FormData(); form.append('logo', file); return req('/settings/logo', { method: 'POST', form }); },
  deleteLogo: () => req('/settings/logo', { method: 'DELETE' }),
  stats: () => take('stats', () => req('/stats')),
  duplicateProduct: (id) => req(`/products/${id}/duplicate`, { method: 'POST' }),
  invalidateSettings: () => { settingsP = null; },
  audit: (pid, params) => req(`/products/${pid}/audit` + qs(params || {})),
  tags: (q, signal) => req('/tags' + qs({ q }), { signal }),
};

// Server may answer with an array or {items|data|rows}
export const asList = (d) => (Array.isArray(d) ? d : d?.items || d?.data || d?.rows || d?.categories || d?.units || d?.movements || d?.tags || []);

// Field errors may come as {"variants.0.price": msg} or {"variants[0].price": msg} or arrays of msgs
export function normFields(f) {
  const out = {};
  if (!f) return out;
  for (const k in f) {
    const v = Array.isArray(f[k]) ? f[k][0] : f[k];
    out[k.replace(/\[(\d+)\]/g, '.$1')] = typeof v === 'object' ? v?.message || JSON.stringify(v) : v;
  }
  return out;
}
