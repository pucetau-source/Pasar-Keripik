import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { imgUrl } from './product.js';
import { hasStoredLang, useI18n } from './i18n.jsx';

const Ctx = createContext(null);
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? n : d; };

// Shop identity + low-stock threshold, shared by the shell and the Settings page.
export function SettingsProvider({ children }) {
  const { setLang } = useI18n();
  const [raw, setRaw] = useState(null);
  useEffect(() => { api.settings().then((s) => setRaw(s?.settings || s)).catch(() => {}); }, []);
  // Device without its own language choice follows the shop default (not persisted, so later changes still apply)
  useEffect(() => { if (raw?.default_language && !hasStoredLang()) setLang(raw.default_language, false); }, [raw?.default_language, setLang]);
  const apply = useCallback((s) => setRaw(s?.settings || s), []);
  const value = useMemo(() => ({
    raw,
    shopName: raw?.shop_name || 'Pasar Keripik',
    tagline: raw?.tagline ?? '',
    logoUrl: raw?.logo_url ? imgUrl(raw.logo_url) : null,
    threshold: num(raw?.low_stock_threshold, 10),
    defaultLang: raw?.default_language || null,
    apply,
  }), [raw, apply]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSettings = () => useContext(Ctx);
