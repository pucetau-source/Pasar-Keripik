import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { id } from './dict-id.js';
import { en } from './dict-en.js';

const DICTS = { id, en };
const KEY = 'pk_lang';
export const LANGS = ['id', 'en'];

export function getLang() {
  try {
    const v = localStorage.getItem(KEY);
    if (LANGS.includes(v)) return v;
  } catch { /* ignore */ }
  return 'id';
}

const Ctx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getLang);
  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((k, vars) => {
    let s = DICTS[lang][k] ?? DICTS.id[k] ?? k;
    if (vars) for (const n in vars) s = s.replaceAll(`{${n}}`, vars[n]);
    return s;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
