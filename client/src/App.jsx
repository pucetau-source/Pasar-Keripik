import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Route, Routes, Link, useLocation } from 'react-router-dom';
import Icon from './components/Icon.jsx';
import Logo from './components/Logo.jsx';
import { Skel } from './components/ui.jsx';
import { useI18n, LANGS } from './lib/i18n.jsx';
import { useTheme } from './lib/theme.jsx';
import { useSettings } from './lib/settings.jsx';
import { fmtNow, useNow } from './lib/clock.js';
import { api } from './lib/api.js';
import { TitleCtx } from './lib/title.jsx';

const Products = lazy(() => import('./pages/Products.jsx'));
const ProductForm = lazy(() => import('./pages/ProductForm.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Units = lazy(() => import('./pages/Units.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

// Nav data drives the sidebar groups and the single page title shown in the topbar.
const GROUPS = [
  { key: 'nav.group.catalog', items: [
    { to: '/', key: 'nav.products', icon: 'box', also: '/products' },
    { to: '/categories', key: 'nav.categories', icon: 'tree' },
    { to: '/units', key: 'nav.units', icon: 'scale' },
  ] },
  { key: 'nav.group.system', items: [{ to: '/settings', key: 'nav.settings', icon: 'settings' }] },
];
const ITEMS = GROUPS.flatMap((g) => g.items);

// Exact match for '/', prefix match for the rest (and /products/* belongs to Products)
const isOn = (n, path) => (n.to === '/' ? path === '/' || path === n.also || path.startsWith(n.also + '/') : path === n.to || path.startsWith(n.to + '/'));

function ThemeSwitch() {
  const { dark, setPref } = useTheme();
  const { t } = useI18n();
  return (
    <div className="seg seg-sm" role="radiogroup" aria-label={t('nav.theme')}>
      {[['light', 'sun', t('set.themeLight')], ['dark', 'moon', t('set.themeDark')]].map(([k, icon, label]) => (
        <button key={k} type="button" role="radio" aria-checked={(k === 'dark') === dark} aria-label={label} title={label} onClick={() => setPref(k)}>
          <Icon name={icon} size={16} className="mx-auto" />
        </button>
      ))}
    </div>
  );
}

function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="seg seg-sm" role="radiogroup" aria-label={t('nav.language')}>
      {LANGS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className="uppercase">{l}</button>
      ))}
    </div>
  );
}

function Clock() {
  const { lang } = useI18n();
  const { date, time } = fmtNow(lang, useNow());
  return (
    <div className="text-xs text-ink-soft tabnum whitespace-nowrap" title="WIB (UTC+7)">
      <span className="hidden md:inline">{date}<span className="mx-1.5 text-ink-mute">&middot;</span></span>
      <span className="font-semibold text-ink">{time}</span> <span className="text-ink-mute">WIB</span>
    </div>
  );
}

function Brand() {
  const { shopName, tagline } = useSettings();
  return (
    <Link to="/" className="flex items-center gap-3 min-w-0 rounded-xl" aria-label={shopName}>
      <Logo size={40} />
      <span className="min-w-0">
        <span className="font-bold text-[17px] leading-tight block truncate">{shopName}</span>
        {tagline && <span className="text-[11px] text-ink-mute block truncate leading-tight">{tagline}</span>}
      </span>
    </Link>
  );
}

function UserCard() {
  const { t } = useI18n();
  const { shopName } = useSettings();
  const [me, setMe] = useState(null);
  const loc = useLocation();
  useEffect(() => { api.me().then((m) => setMe(m?.user || m)).catch(() => {}); }, []);
  const on = loc.pathname.startsWith('/settings');
  return (
    <div className="flex items-center gap-2.5 pt-3 border-t border-[var(--line)]">
      <span className="w-9 h-9 rounded-full grid place-items-center text-ink-soft shrink-0 bg-mist-200"><Icon name="user" size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold truncate capitalize">{me?.name || t('nav.user')}</span>
        <span className="block text-[11px] text-ink-mute truncate">{shopName}</span>
      </span>
      <Link to="/settings" className={'btn-icon shrink-0 ' + (on ? '!bg-blue-50 dark:!bg-blue-900/30 !text-blue-700 dark:!text-blue-400 shadow-glass-inset dark:shadow-glass-inset-dark' : '')} aria-label={t('nav.openSettings')} title={t('nav.settings')} aria-current={on ? 'page' : undefined}><Icon name="settings" size={18} /></Link>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skel className="h-12 w-full" />
      <Skel className="h-64 w-full" />
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(null);
  const setTitle = useCallback((v) => setOverride(v), []);
  const menuBtn = useRef(null);
  const asideRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); menuBtn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    asideRef.current?.querySelector('a')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const navItem = ITEMS.find((n) => isOn(n, loc.pathname));
  const title = override || (navItem ? t(navItem.key) : t('nav.products'));
  useEffect(() => { document.title = title + ' · Pasar Keripik'; }, [title]);

  return (
    <TitleCtx.Provider value={setTitle}>
      <div className="min-h-screen lg:flex lg:gap-4 lg:p-4 relative">
        {/* Backdrop glow: fixed behind the scrolling content */}
        <div className="fixed inset-0 -z-10 pointer-events-none bg-glow-light dark:bg-glow-dark" aria-hidden="true" />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-surface focus:px-3 focus:py-2 focus:rounded-lg">{t('nav.skip')}</a>

        {open && <div className="lg:hidden fixed inset-0 z-40 anim-fade" style={{ background: 'var(--backdrop)' }} onClick={() => setOpen(false)} aria-hidden="true" />}

        {/* Sidebar: slide-in drawer below lg, floating glass panel from lg */}
        <aside ref={asideRef} id="sidebar" aria-label="Menu"
          className={'glass-blur shrink-0 flex flex-col gap-5 p-4 w-72 max-w-[85vw] lg:w-[248px] z-50 fixed inset-y-0 left-0 overflow-y-auto transition-[transform,visibility] duration-200 lg:rounded-2xl lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:self-start lg:translate-x-0 lg:visible ' + (open ? 'translate-x-0 visible' : '-translate-x-full invisible')}>
          <div className="flex items-start justify-between gap-2">
            <Brand />
            <button type="button" className="btn-icon lg:hidden -mr-1.5 shrink-0" onClick={() => { setOpen(false); menuBtn.current?.focus(); }} aria-label={t('nav.closeMenu')}><Icon name="x" /></button>
          </div>
          <nav className="flex flex-col gap-4" aria-label="Menu">
            {GROUPS.map((g) => (
              <div key={g.key} className="flex flex-col gap-1">
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t(g.key)}</p>
                {g.items.map((n) => (
                  <Link key={n.to} to={n.to} aria-current={isOn(n, loc.pathname) ? 'page' : undefined} className="nav-item">
                    <Icon name={n.icon} /><span>{t(n.key)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="md:hidden flex items-center justify-between gap-2">
            <ThemeSwitch /><LangSwitch />
          </div>
          <div className="mt-auto"><UserCard /></div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col lg:gap-4">
          {/* Topbar: the one page title (with glow), live WIB clock and switchers */}
          <header className="glass-blur sticky top-0 lg:top-4 z-30 h-14 lg:h-16 px-3 lg:px-5 flex items-center gap-2 lg:gap-3 !border-x-0 !border-t-0 lg:!border-x lg:!border-t lg:rounded-2xl">
            <button ref={menuBtn} type="button" className="btn-icon lg:hidden shrink-0" onClick={() => setOpen(true)} aria-label={t('nav.menu')} aria-expanded={open} aria-controls="sidebar"><Icon name="menu" /></button>
            <h1 className="title-glow text-xl font-bold leading-tight truncate min-w-0 flex-1">{title}</h1>
            <div className="flex items-center gap-2 lg:gap-3 shrink-0">
              <Clock />
              <span className="hidden md:flex items-center gap-2"><ThemeSwitch /><LangSwitch /></span>
            </div>
          </header>

          <main id="main" className="flex-1 px-3 pt-3 pb-6 lg:p-0 w-full max-w-[1560px]">
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Products />} />
                <Route path="/products/new" element={<ProductForm />} />
                <Route path="/products/:id" element={<ProductForm />} />
                <Route path="/products/:id/audit" element={<Audit />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/units" element={<Units />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Products />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </TitleCtx.Provider>
  );
}
