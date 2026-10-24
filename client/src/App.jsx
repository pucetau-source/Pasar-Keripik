import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, Link, useLocation } from 'react-router-dom';
import Icon from './components/Icon.jsx';
import { Skel } from './components/ui.jsx';
import { useI18n, LANGS } from './lib/i18n.jsx';
import { api } from './lib/api.js';

const Products = lazy(() => import('./pages/Products.jsx'));
const ProductForm = lazy(() => import('./pages/ProductForm.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Units = lazy(() => import('./pages/Units.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));

const NAV = [
  { to: '/', key: 'nav.products', icon: 'box', end: true, also: '/products' },
  { to: '/categories', key: 'nav.categories', icon: 'tree' },
  { to: '/units', key: 'nav.units', icon: 'scale' },
];

// Exact match for '/', prefix match for the rest (and /products/* belongs to Products)
const isOn = (n, path) => (n.to === '/' ? path === '/' || path === n.also || path.startsWith(n.also + '/') : path === n.to || path.startsWith(n.to + '/'));

function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-white/70 border border-[var(--line)] p-0.5" role="group" aria-label={t('nav.language')}>
      <Icon name="globe" size={16} className="ml-1.5 text-ink-soft" />
      {LANGS.map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={'px-2 py-1 rounded-md text-xs font-bold uppercase min-w-[34px] ' + (lang === l ? 'bg-chili-600 text-white' : 'text-ink-soft hover:bg-chili-50')}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Brand() {
  const [shop, setShop] = useState('Pasar Keripik');
  useEffect(() => { api.settings().then((s) => { const n = s?.shop_name || s?.settings?.shop_name; if (n) setShop(n); }).catch(() => {}); }, []);
  return (
    <Link to="/" className="flex items-center gap-3 min-w-0">
      <span className="w-10 h-10 rounded-xl grid place-items-center text-white shrink-0" style={{ background: 'linear-gradient(145deg,#c4452a,#8a2b16)' }} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 32 32"><path d="M6 21c2-8 7-12 20-10-1 10-8 14-20 10z" fill="#fbe9b8" /><path d="M9 20c4-4 8-6 13-7" stroke="#8a2b16" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
      </span>
      <span className="font-display font-bold text-lg leading-tight truncate">{shop}</span>
    </Link>
  );
}

function UserChip() {
  const [me, setMe] = useState(null);
  useEffect(() => { api.me().then((m) => setMe(m?.user || m)).catch(() => {}); }, []);
  if (!me?.name) return null;
  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 text-sm text-ink-soft">
      <Icon name="user" size={16} />{me.name}
    </span>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skel className="h-9 w-56" />
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
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-3 focus:py-2 focus:rounded">{t('nav.skip')}</a>

      {/* Desktop / tablet sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 p-4 sticky top-0 h-screen">
        <div className="glass rounded-2xl p-4 flex-1 flex flex-col gap-6">
          <Brand />
          <nav className="flex flex-col gap-1" aria-label="Menu">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} aria-current={isOn(n, loc.pathname) ? 'page' : undefined}
                className={'flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition-colors ' + (isOn(n, loc.pathname) ? 'bg-chili-600 text-white shadow' : 'text-ink-soft hover:bg-white/70')}>
                <Icon name={n.icon} />{t(n.key)}
              </Link>
            ))}
          </nav>
          <div className="mt-auto text-xs text-ink-mute">{t('nav.tz')}</div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="glass sticky top-0 z-30 md:mt-4 md:mr-4 md:rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="md:hidden min-w-0"><Brand /></div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3"><UserChip /><LangSwitch /></div>
        </header>

        <main id="main" className="flex-1 px-4 md:pl-2 md:pr-4 py-5 pb-28 md:pb-10 max-w-6xl w-full mx-auto">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Products />} />
              <Route path="/products/new" element={<ProductForm />} />
              <Route path="/products/:id" element={<ProductForm />} />
              <Route path="/products/:id/audit" element={<Audit />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/units" element={<Units />} />
              <Route path="*" element={<Products />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Phone bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] grid grid-cols-3 gap-1" aria-label="Menu">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} aria-current={isOn(n, loc.pathname) ? 'page' : undefined}
            className={'flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-xs font-bold ' + (isOn(n, loc.pathname) ? 'bg-chili-600 text-white' : 'text-ink-soft')}>
            <Icon name={n.icon} size={22} />{t(n.key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
