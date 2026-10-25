import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Light mode only. The palette (green = default, blue) is a data attribute on <html>; CSS variables do the rest.
const KEY = 'pk_palette';
export const PALETTES = ['green', 'blue'];
const META = { green: '#f4eff7', blue: '#f9fafb' };

const stored = () => { try { const v = localStorage.getItem(KEY); return PALETTES.includes(v) ? v : 'green'; } catch { return 'green'; } };

function apply(p) {
  document.documentElement.setAttribute('data-palette', p);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[p]);
}

const Ctx = createContext(null);

export function ThemeProvider({ children }) {
  const [palette, setPaletteState] = useState(stored);
  useEffect(() => { apply(palette); }, [palette]);
  const setPalette = useCallback((p) => {
    if (!PALETTES.includes(p)) return;
    setPaletteState(p);
    try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  }, []);
  const value = useMemo(() => ({ palette, setPalette }), [palette, setPalette]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
