import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'pk_theme';
export const THEMES = ['system', 'light', 'dark'];

const stored = () => { try { const v = localStorage.getItem(KEY); return THEMES.includes(v) ? v : 'system'; } catch { return 'system'; } };
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function apply(pref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  const d = document.documentElement;
  d.setAttribute('data-theme', dark ? 'dark' : 'light');
  d.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f172a' : '#f8fafc');
  return dark;
}

const Ctx = createContext(null);

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(stored);
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  useEffect(() => {
    setDark(apply(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => setDark(apply('system'));
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [pref]);
  const setPref = useCallback((p) => { setPrefState(p); try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* ignore */ } }, []);
  const toggle = useCallback(() => setPref(dark ? 'light' : 'dark'), [dark, setPref]);
  const value = useMemo(() => ({ pref, dark, setPref, toggle }), [pref, dark, setPref, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
