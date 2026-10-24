import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, Link, useLocation } from 'react-router-dom';
import Icon from './components/Icon.jsx';
import Logo from './components/Logo.jsx';
import { Skel } from './components/ui.jsx';
import { useI18n, LANGS } from './lib/i18n.jsx';
import { useTheme } from './lib/theme.jsx';
import { useSettings } from './lib/settings.jsx';
import { fmtNow, useNow } from './lib/clock.js';
import { api } from './lib/api.js';

const Products = lazy(() => import('./pages/Products.jsx'));
const ProductForm = lazy(() => import('./pages/ProductForm.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Units = lazy(() => import('./pages/Units.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const NAV = [
  { to: '/', key: 'nav.products', icon: 'box', end: true, also: '/products' },
  { to: '/categories', key: 'nav.categories', icon: 'tree' },
  { to: '/units', key: 'nav.units', icon: 'scale' },
];
const SETTINGS_NAV = { to: '/settings', key: 'nav.settings', icon: 'settings' };

// Exact match for '/', prefix match for the rest (and /products/* belongs to Products)
const isOn = (n, path) => (n.to === '/' ? path === '/' || path === n.also || path.startsWith(n.also + '/') : path === n.to || path.startsWith(n.to + '/'));

function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="inline-flex items-center rounded-lg border border-[var(--line)] p-0.5 bg-surface/70" role="group" aria-label={t('nav.language')}>
      {LANGS.map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={'px-2 h-7 rounded-md text-xs font-bold uppercase min-w-[32px] ' + (lang === l ? 'bg-chili-600 text-white' : 'text-ink-soft hover:bg-[var(--btn-hover)]')}>
          {l}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  const { t } = useI18n();
  const label = dark ? t('nav.themeLight') : t('nav.themeDark');
  return (
    <button type="button" onClick={toggle} className="btn-icon border border-[var(--line)] bg-surface/70" aria-label={label} title={label}>
      <Icon name={dark ? 'sun' : 'moon'} size={18} />
    </button>
  );
}

function Clock() {
  const { lang } = useI18n();
  const { date, time } = fmtNow(lang, useNow());
  return (
    <div className="text-xs text-ink-soft tabnum whitespace-nowrap" title="WIB (UTC+7)">
      <span className="hidden sm:inline">{date}<span className="mx-1.5 text-ink-mute">&middot;</span></span>
      <span className="font-semibold text-ink">{time}</span> <span className="text-ink-mute">WIB</span>
    </div>
  );
}

function Brand({ compact }) {
  const { shopName, tagline } = useSettings();
  return (
    <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label={shopName}>
      <Logo size={compact ? 32 : 40} />
      {!compact && (
        <span className="min-w-0">
          <span className="font-display font-bold text-[19px] leading-tight block truncate">{shopName}</span>
          {tagline && <span className="text-[11px] text-ink-mute block truncate leading-tight">{tagline}</span>}
        </span>
      )}
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
    <div className="flex flex-col lg:flex-row items-center gap-2 lg:gap-2.5 pt-3 border-t border-[var(--line)]">
      <span className="w-9 h-9 rounded-full grid place-items-center text-ink-soft shrink-0 bg-cream-200"><Icon name="user" size={18} /></span>
      <span className="min-w-0 flex-1 hidden lg:block">
        <span className="block text-[13px] font-semibold truncate capitalize">{me?.name || t('nav.user')}</span>
        <span className="block text-[11px] text-ink-mute truncate">{shopName}</span>
      </span>
      <Link to="/settings" className={'btn-icon shrink-0 ' + (on ? '!bg-leaf-100 !text-leaf-700' : '')} aria-label={t('nav.openSettings')} title={t('nav.settings')} aria-current={on ? 'page' : undefined}><Icon name="settings" size={18} /></Link>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skel className="h-8 w-48" />
      <Skel className="h-12 w-full" />
      <Skel className="h-64 w-full" />
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-screen md:flex md:gap-3 md:p-3 md:pr-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-surface focus:px-3 focus:py-2 focus:rounded">{t('nav.skip')}</a>

      {/* Tablet: icon rail. Desktop: full sidebar */}
      <aside className="hidden md:block shrink-0 w-[64px] lg:w-[232px] sticky top-3 h-[calc(100vh-24px)] self-start">
        <div className="frost rounded-2xl h-full p-2.5 lg:p-3.5 flex flex-col gap-5">
          <div className="flex justify-center lg:justify-start"><span className="hidden lg:block min-w-0"><Brand /></span><span className="lg:hidden"><Brand compact /></span></div>
          <nav className="flex flex-col gap-1" aria-label="Menu">
            {NAV.map((n) => {
              const on = isOn(n, loc.pathname);
              return (
                <Link key={n.to} to={n.to} aria-current={on ? 'page' : undefined} title={t(n.key)}
                  className={'flex items-center justify-center lg:justify-start gap-3 h-10 lg:px-3 rounded-xl font-semibold transition-colors ' + (on ? 'bg-leaf-100 text-leaf-700' : 'text-ink-soft hover:bg-[var(--btn-hover)] hover:text-ink')}>
                  <Icon name={n.icon} /><span className="hidden lg:inline">{t(n.key)}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto"><UserCard /></div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="frost !border-x-0 !border-t-0 md:!bg-transparent md:!border-0 md:!shadow-none md:![backdrop-filter:none] sticky top-0 md:static z-30 px-3 md:px-6 h-12 flex items-center justify-between gap-2">
          <div className="md:hidden min-w-0"><Brand compact /></div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2 md:gap-3"><Clock /><ThemeToggle /><LangSwitch /></div>
        </header>

        <main id="main" className="flex-1 px-3 md:px-6 pt-3 md:pt-0 pb-24 md:pb-8 max-w-[1560px] w-full mx-auto">
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

      {/* Phone bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 frost !border-x-0 !border-b-0 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] grid grid-cols-4 gap-1" aria-label="Menu">
        {[...NAV, SETTINGS_NAV].map((n) => (
          <Link key={n.to} to={n.to} aria-current={isOn(n, loc.pathname) ? 'page' : undefined}
            className={'flex flex-col items-center gap-0.5 py-1 rounded-xl text-[11px] font-bold ' + (isOn(n, loc.pathname) ? 'bg-leaf-100 text-leaf-700' : 'text-ink-soft')}>
            <Icon name={n.icon} size={20} />{t(n.key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
