import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog, Empty, ErrorBox, Pagination, Skel, useAsync, useToast } from '../components/ui.jsx';
import StockDialog from '../components/StockDialog.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSettings } from '../lib/settings.jsx';
import { int, rupiah } from '../lib/format.js';
import { flatten, ensureTree } from '../lib/tree.js';
import { imgUrl, normList } from '../lib/product.js';

const PAGE_SIZE = 20;
const LOW_FILTER = false; // flip to true once GET /products supports low_stock=1 (server has no such filter yet)

function Thumb({ src, name, size = 44 }) {
  const [bad, setBad] = useState(false);
  const box = { width: size, height: size };
  if (!src || bad) return <div style={box} className="rounded-lg bg-turmeric-100 text-turmeric-600 grid place-items-center shrink-0"><Icon name="image" size={18} /></div>;
  return <img src={imgUrl(src)} alt="" width={size} height={size} style={box} loading="lazy" decoding="async" onError={() => setBad(true)} className="rounded-lg object-cover shrink-0 bg-cream-200" />;
}

function PriceRange({ p }) {
  const { t } = useI18n();
  const a = p.eff_min, b = p.eff_max;
  return (
    <span className="tabnum">
      {a === b || b == null ? rupiah(a) : `${rupiah(a)} \u2013 ${rupiah(b)}`}
      {p.has_discount && <span className="chip bg-chili-100 text-chili-700 ml-1.5 align-middle !py-0">{t('list.discount')}</span>}
    </span>
  );
}

function StatusChip({ s }) {
  const { t } = useI18n();
  const on = s === 'active';
  return (
    <span className={'chip ' + (on ? 'bg-leaf-100 text-leaf-700' : 'bg-cream-200 text-ink-soft')}>
      <span className={'w-1.5 h-1.5 rounded-full ' + (on ? 'bg-leaf-600' : 'bg-ink-mute')} aria-hidden="true" />{on ? t('status.active') : t('status.inactive')}
    </span>
  );
}

function StockBadge({ p }) {
  const { t } = useI18n();
  const n = p.stock;
  return (
    <span className={'tabnum font-semibold inline-flex items-center gap-1 ' + (n <= 0 ? 'text-chili-700' : p.low_stock ? 'text-turmeric-600' : '')}>
      {p.low_stock && n > 0 && <Icon name="alert" size={14} aria-label={t('list.low')} />}
      {int(n)}{n <= 0 && <span className="chip bg-chili-100 text-chili-700 !py-0">{t('list.out')}</span>}
    </span>
  );
}

function StatCard({ icon, tone, label, value, onClick, active }) {
  const body = (
    <>
      <span className={'hidden sm:grid w-9 h-9 rounded-full place-items-center shrink-0 ' + tone}><Icon name={icon} size={18} /></span>
      <span className="min-w-0 text-left">
        <span className="block text-[11px] sm:text-xs text-ink-mute leading-tight">{label}</span>
        <span className="block text-lg sm:text-xl font-bold leading-tight tabnum">{value == null ? '\u2013' : int(value)}</span>
      </span>
    </>
  );
  const cls = 'glass rounded-xl px-3 py-2 flex items-center gap-2.5 sm:min-w-[140px] ' + (active ? '!border-chili-600 ring-1 ring-chili-600 ' : '');
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={!!active} className={cls + 'hover:bg-sunken transition-colors'}>{body}</button>
    : <div className={cls}>{body}</div>;
}

function Breadcrumb({ path, fallback }) {
  const parts = path?.length ? path : fallback ? [fallback] : [];
  return <span className="text-xs text-ink-mute block truncate">{parts.join(' \u00b7 ')}</span>;
}

export default function Products() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { threshold } = useSettings();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const category_id = sp.get('category_id') || '';
  const status = sp.get('status') || '';
  const sort = sp.get('sort') || '';
  const low = LOW_FILTER && sp.get('low_stock') === '1' ? '1' : '';
  const page = Number(sp.get('page') || 1);
  const [qInput, setQInput] = useState(q);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stockFor, setStockFor] = useState(null);
  const [dupId, setDupId] = useState(null);

  const set = (patch) => {
    const n = new URLSearchParams(sp);
    for (const k in patch) { if (patch[k] === '' || patch[k] == null) n.delete(k); else n.set(k, patch[k]); }
    if (!('page' in patch)) n.delete('page');
    setSp(n, { replace: true });
  };

  useEffect(() => {
    if (qInput === q) return;
    const h = setTimeout(() => set({ q: qInput }), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const cats = useAsync(() => api.categories(), []);
  const flat = useMemo(() => flatten(ensureTree(cats.data?.categories || cats.data)), [cats.data]);
  const pathById = useMemo(() => new Map(flat.map((c) => [c.id, c.path])), [flat]);
  const stats = useAsync(() => api.stats().catch(() => null), []);

  const list = useAsync((signal) => api.products({ q, category_id, status, sort, low_stock: low, page, page_size: PAGE_SIZE }, signal).then(normList), [q, category_id, status, sort, low, page]);

  async function doDelete() {
    const p = confirm;
    setBusy(true);
    const before = list.data;
    list.setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== p.id), total: d.total - 1 })); // optimistic
    try {
      await api.deleteProduct(p.id);
      toast(t('list.deleted', { name: p.name }));
      setConfirm(null);
      stats.reload();
      if (before.items.length === 1 && page > 1) set({ page: page - 1 }); else list.reload();
    } catch (e) {
      list.setData(before);
      toast(e.message, 'err');
      setConfirm(null);
    } finally { setBusy(false); }
  }

  async function duplicate(p) {
    if (dupId) return;
    setDupId(p.id);
    try {
      const res = await api.duplicateProduct(p.id);
      const created = res?.product || res;
      toast(t('list.duplicated'));
      nav(`/products/${created.id}`);
    } catch (e) { toast(e.message, 'err'); setDupId(null); }
  }

  const filtered = q || category_id || status || low;
  const d = list.data;
  const st = stats.data;

  const actions = (p) => (
    <>
      <Link className="btn-icon" title={t('common.edit')} aria-label={t('common.edit') + ': ' + p.name} to={`/products/${p.id}`}><Icon name="edit" size={18} /></Link>
      <button className="btn-icon" title={t('list.duplicate')} aria-label={t('list.duplicate') + ': ' + p.name} disabled={!!dupId} onClick={() => duplicate(p)}><Icon name="copy" size={18} /></button>
      <button className="btn-icon hover:!text-chili-700" title={t('common.delete')} aria-label={t('common.delete') + ': ' + p.name} onClick={() => setConfirm(p)}><Icon name="trash" size={18} /></button>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex-1 basis-[120px] min-w-0">
          <h1 className="text-2xl font-bold leading-tight">{t('nav.products')}</h1>
          <p className="text-[13px] text-ink-soft">{t('list.subtitle')}</p>
        </div>
        <Link to="/products/new" className="btn-primary order-2 lg:order-3"><Icon name="plus" />{t('list.add')}</Link>
        <div className="order-3 lg:order-2 w-full lg:w-auto grid grid-cols-3 gap-2 lg:flex">
          <StatCard icon="box" tone="bg-cream-200 text-ink-soft" label={t('stat.total')} value={st?.total_products} />
          <StatCard icon="alert" tone="bg-chili-100 text-chili-700" label={t('stat.low')} value={st?.low_stock_products}
            onClick={LOW_FILTER ? () => set({ low_stock: low ? '' : '1' }) : undefined} active={!!low} />
          <StatCard icon="checkc" tone="bg-leaf-100 text-leaf-700" label={t('stat.active')} value={st?.active_products} />
        </div>
      </div>

      <div className="glass rounded-xl p-2.5 grid gap-2 grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_150px_170px]">
        <div className="relative col-span-2 lg:col-span-1">
          <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input type="search" className="input pl-10" placeholder={t('list.search')} aria-label={t('list.search')} value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <select className="input col-span-2 lg:col-span-1" aria-label={t('list.category')} value={category_id} onChange={(e) => set({ category_id: e.target.value })}>
          <option value="">{t('list.allCategories')}</option>
          {flat.map((c) => <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.name}</option>)}
        </select>
        <select className="input" aria-label={t('list.status')} value={status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">{t('list.allStatus')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="inactive">{t('status.inactive')}</option>
        </select>
        <select className="input" aria-label={t('list.sort')} value={sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="">{t('list.sortNew')}</option>
          <option value="oldest">{t('list.sortOld')}</option>
          <option value="updated">{t('list.sortUpdated')}</option>
          <option value="name_asc">{t('list.sortName')}</option>
          <option value="name_desc">{t('list.sortNameDesc')}</option>
          <option value="price_asc">{t('list.sortPriceAsc')}</option>
          <option value="price_desc">{t('list.sortPriceDesc')}</option>
          <option value="stock_asc">{t('list.sortStock')}</option>
          <option value="stock_desc">{t('list.sortStockDesc')}</option>
        </select>
      </div>

      {low && (
        <p className="text-[13px] text-ink-soft flex items-center gap-2">
          <span className="chip bg-chili-100 text-chili-700"><Icon name="alert" size={12} />{t('list.lowFilter', { n: int(threshold) })}</span>
          <button type="button" className="underline hover:text-ink" onClick={() => set({ low_stock: '' })}>{t('list.clear')}</button>
        </p>
      )}

      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}

      {!list.error && (
        <div className="glass rounded-xl overflow-hidden" aria-busy={list.loading}>
          {list.loading && !d && (
            <div className="p-3 space-y-2.5">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-3 items-center"><Skel className="w-11 h-11" /><div className="flex-1 space-y-2"><Skel className="h-3.5 w-2/3" /><Skel className="h-3 w-1/3" /></div></div>)}</div>
          )}
          {d && d.items.length === 0 && (
            <Empty icon="box" title={filtered ? t('list.noMatch') : t('list.empty')} text={filtered ? t('list.noMatchText') : t('list.emptyText')}
              action={filtered ? <button className="btn-soft" onClick={() => { setQInput(''); setSp({}, { replace: true }); }}>{t('list.clear')}</button>
                : <Link to="/products/new" className="btn-primary"><Icon name="plus" />{t('list.add')}</Link>} />
          )}
          {d && d.items.length > 0 && (
            <>
              {/* Table: tablet and up */}
              <div className="hidden md:block overflow-x-auto scroll-thin"><table className={'w-full transition-opacity ' + (list.loading ? 'opacity-60' : '')}>
                <thead className="border-b border-[var(--line)]"><tr>
                  <th className="th">{t('list.product')}</th><th className="th">{t('list.priceCol')}</th><th className="th text-right">{t('list.stockCol')}</th><th className="th hidden xl:table-cell">{t('list.status')}</th><th className="th text-right">{t('common.actions')}</th>
                </tr></thead>
                <tbody>
                  {d.items.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--row-hover)]">
                      <td className="td !py-1.5">
                        <Link to={`/products/${p.id}`} className="flex items-center gap-3 group">
                          <Thumb src={p.thumb} name={p.name} />
                          <span className="min-w-0">
                            <span className="font-semibold block group-hover:underline break-words leading-snug">{p.name}</span>
                            <Breadcrumb path={pathById.get(p.category_id)} fallback={p.category_name} />
                            <span className="xl:hidden inline-block mt-0.5"><StatusChip s={p.status} /></span>
                          </span>
                        </Link>
                      </td>
                      <td className="td lg:whitespace-nowrap"><PriceRange p={p} /></td>
                      <td className="td text-right">
                        <button type="button" className="rounded px-1.5 -mr-1.5 hover:bg-[var(--btn-hover)]" title={t('list.stock')} aria-label={t('list.stock') + ': ' + p.name} onClick={() => setStockFor(p)}><StockBadge p={p} /></button>
                      </td>
                      <td className="td hidden xl:table-cell"><StatusChip s={p.status} /></td>
                      <td className="td whitespace-nowrap text-right !pr-2">{actions(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>

              {/* Cards: phone */}
              <ul className={'md:hidden divide-y divide-[var(--line)] ' + (list.loading ? 'opacity-60' : '')}>
                {d.items.map((p) => (
                  <li key={p.id} className="p-2.5 flex gap-1.5 items-center">
                    <Link to={`/products/${p.id}`} className="flex gap-2.5 flex-1 min-w-0 items-center">
                      <Thumb src={p.thumb} name={p.name} size={52} />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold block break-words leading-snug">{p.name}</span>
                        <Breadcrumb path={pathById.get(p.category_id)} fallback={p.category_name} />
                        <span className="block text-[13px]"><PriceRange p={p} /></span>
                        <span className="flex items-center gap-2 text-[13px] mt-0.5 flex-wrap"><span className="text-ink-mute">{t('list.stockCol')}</span><StockBadge p={p} /><StatusChip s={p.status} /></span>
                      </span>
                    </Link>
                    <div className="flex flex-col shrink-0">{actions(p)}</div>
                  </li>
                ))}
              </ul>
              <div className="px-3 py-2 border-t border-[var(--line)]"><Pagination page={page} pages={d.pages} total={d.total} onPage={(n) => set({ page: n })} /></div>
            </>
          )}
        </div>
      )}

      {confirm && <ConfirmDialog title={t('list.deleteTitle')} message={t('list.deleteMsg', { name: confirm.name })} busy={busy} onConfirm={doDelete} onClose={() => setConfirm(null)} />}
      {stockFor && <StockDialog product={stockFor} onClose={() => setStockFor(null)} onChanged={() => { list.reload(); stats.reload(); }} />}
    </div>
  );
}
