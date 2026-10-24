import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { I18nProvider, getLang } from './lib/i18n.jsx';
import { ToastProvider } from './components/ui.jsx';
import { api, qs } from './lib/api.js';

// Cold load: start the data calls and the page chunk right away, in parallel with settings/me.
api.settings().catch(() => {}); api.me().catch(() => {});
if (location.pathname === '/') {
  const sp = new URLSearchParams(location.search);
  const params = { q: sp.get('q') || '', category_id: sp.get('category_id') || '', status: sp.get('status') || '', sort: sp.get('sort') || '', page: Number(sp.get('page') || 1), page_size: 20 };
  api.prefetch('categories', () => api.categories());
  api.prefetch('products' + qs(params), () => api.products(params));
  import('./pages/Products.jsx');
}

document.documentElement.lang = getLang();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
