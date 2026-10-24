import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog, Empty, ErrorBox, Pagination, Skel, useAsync, useToast } from '../components/ui.jsx';
import StockDialog from '../components/StockDialog.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { int, rupiah } from '../lib/format.js';
import { flatten, ensureTree } from '../lib/tree.js';
import { imgUrl, normList } from '../lib/product.js';

const PAGE_SIZE = 20;

function Thumb({ src, name }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className="w-14 h-14 rounded-xl bg-turmeric-100 text-turmeric-600 grid place-items-center shrink-0"><Icon name="image" /></div>;
  return <img src={imgUrl(src)} alt={name} width="56" height="56" loading="lazy" decoding="async" onError={() => setBad(true)} className="w-14 h-14 rounded-xl object-cover shrink-0 bg-cream-200" />;
}

function PriceRange({ p }) {
  const { t } = useI18n();
  const a = p.eff_min, b = p.eff_max;
  return (
    <span className="tabnum">
      {a === b || b == null ? rupiah(a) : `${rupiah(a)} - ${rupiah(b)}`}
      {p.has_discount && <span className="chip bg-chili-100 text-chili-700 ml-2 align-middle">{t('list.discount')}</span>}
    </span>
  );
}

function StatusChip({ s }) {
  const { t } = useI18n();
  return <span className={'chip ' + (s === 'active' ? 'bg-leaf-100 text-leaf-700' : 'bg-ink-mute/20 text-ink-soft')}>{s === 'active' ? t('status.active') : t('status.inactive')}</span>;
}

function StockBadge({ n }) {
  const { t } = useI18n();
  return <span className={'tabnum font-semibold ' + (n <= 0 ? 'text-chili-700' : '')}>{int(n)}{n <= 0 && <span className="chip bg-chili-100 text-chili-700 ml-2">{t('list.out')}</span>}</span>;
}

export default function Products() {
  const { t } = useI18n();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const category_id = sp.get('category_id') || '';
  const status = sp.get('status') || '';
  const sort = sp.get('sort') || '';
  const page = Number(sp.get('page') || 1);
  const [qInput, setQInput] = useState(q);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stockFor, setStockFor] = useState(null);

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

  const list = useAsync((signal) => api.products({ q, category_id, status, sort, page, page_size: PAGE_SIZE }, signal).then(normList), [q, category_id, status, sort, page]);

  async function doDelete() {
    const p = confirm;
    setBusy(true);
    const before = list.data;
    list.setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== p.id), total: d.total - 1 })); // optimistic
    try {
      await api.deleteProduct(p.id);
      toast(t('list.deleted', { name: p.name }));
      setConfirm(null);
      if (before.items.length === 1 && page > 1) set({ page: page - 1 }); else list.reload();
    } catch (e) {
      list.setData(before);
      toast(e.message, 'err');
      setConfirm(null);
    } finally { setBusy(false); }
  }

  const filtered = q || category_id || status;
  const d = list.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">{t('nav.products')}</h1>
        <Link to="/products/new" className="btn-primary"><Icon name="plus" />{t('list.add')}</Link>
      </div>

      <div className="glass rounded-2xl p-3 sm:p-4 grid gap-3 grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-[2fr_1.4fr_1fr_1.2fr]">
        <div className="relative min-[480px]:col-span-2 xl:col-span-1">
          <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input type="search" className="input pl-10" placeholder={t('list.search')} aria-label={t('list.search')} value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <select className="input min-[480px]:col-span-2 xl:col-span-1" aria-label={t('list.category')} value={category_id} onChange={(e) => set({ category_id: e.target.value })}>
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

      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}

      {!list.error && (
        <div className="glass rounded-2xl overflow-hidden" aria-busy={list.loading}>
          {list.loading && !d && (
            <div className="p-4 space-y-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-3 items-center"><Skel className="w-14 h-14" /><div className="flex-1 space-y-2"><Skel className="h-4 w-2/3" /><Skel className="h-3 w-1/3" /></div></div>)}</div>
          )}
          {d && d.items.length === 0 && (
            <Empty icon="box" title={filtered ? t('list.noMatch') : t('list.empty')} text={filtered ? t('list.noMatchText') : t('list.emptyText')}
              action={filtered ? <button className="btn-soft" onClick={() => { setQInput(''); setSp({}, { replace: true }); }}>{t('list.clear')}</button>
                : <Link to="/products/new" className="btn-primary"><Icon name="plus" />{t('list.add')}</Link>} />
          )}
          {d && d.items.length > 0 && (
            <>
              {/* Table: wide screens only (sidebar leaves too little room below 1024px) */}
              <table className={'w-full hidden lg:table transition-opacity ' + (list.loading ? 'opacity-60' : '')}>
                <thead className="border-b border-[var(--line)]"><tr>
                  <th className="th">{t('list.product')}</th><th className="th">{t('list.priceCol')}</th><th className="th text-right">{t('list.stockCol')}</th><th className="th">{t('list.status')}</th><th className="th"><span className="sr-only">{t('common.actions')}</span></th>
                </tr></thead>
                <tbody>
                  {d.items.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--line)] last:border-0 hover:bg-white/40">
                      <td className="td">
                        <Link to={`/products/${p.id}`} className="flex items-center gap-3 group">
                          <Thumb src={p.thumb} name={p.name} />
                          <span className="min-w-0">
                            <span className="font-semibold block group-hover:underline break-words">{p.name}</span>
                            <span className="text-xs text-ink-soft">{p.category_name}{p.variant_count > 1 ? ` · ${t('list.variants', { n: p.variant_count })}` : ''}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="td"><PriceRange p={p} /></td>
                      <td className="td text-right"><StockBadge n={p.stock} /></td>
                      <td className="td"><StatusChip s={p.status} /></td>
                      <td className="td whitespace-nowrap text-right">
                        <button className="btn-icon" title={t('list.stock')} aria-label={t('list.stock') + ': ' + p.name} onClick={() => setStockFor(p)}><Icon name="stock" /></button>
                        <Link className="btn-icon" title={t('list.history')} aria-label={t('list.history') + ': ' + p.name} to={`/products/${p.id}/audit`}><Icon name="history" /></Link>
                        <Link className="btn-icon" title={t('common.edit')} aria-label={t('common.edit') + ': ' + p.name} to={`/products/${p.id}`}><Icon name="edit" /></Link>
                        <button className="btn-icon hover:!text-chili-700" title={t('common.delete')} aria-label={t('common.delete') + ': ' + p.name} onClick={() => setConfirm(p)}><Icon name="trash" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cards: phone and tablet */}
              <ul className={'lg:hidden divide-y divide-[var(--line)] ' + (list.loading ? 'opacity-60' : '')}>
                {d.items.map((p) => (
                  <li key={p.id} className="p-3">
                    <Link to={`/products/${p.id}`} className="flex gap-3">
                      <Thumb src={p.thumb} name={p.name} />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold block break-words">{p.name}</span>
                        <span className="text-xs text-ink-soft block">{p.category_name}{p.variant_count > 1 ? ` · ${t('list.variants', { n: p.variant_count })}` : ''}</span>
                        <span className="block text-sm mt-0.5"><PriceRange p={p} /></span>
                        <span className="flex items-center gap-2 text-sm mt-0.5">{t('list.stockCol')}: <StockBadge n={p.stock} /> <StatusChip s={p.status} /></span>
                      </span>
                    </Link>
                    <div className="flex flex-wrap justify-end gap-1 mt-1">
                      <Link className="btn-ghost" to={`/products/${p.id}`}><Icon name="edit" size={18} />{t('common.edit')}</Link>
                      <button className="btn-ghost" onClick={() => setStockFor(p)}><Icon name="stock" size={18} />{t('list.stock')}</button>
                      <Link className="btn-ghost" to={`/products/${p.id}/audit`}><Icon name="history" size={18} />{t('list.history')}</Link>
                      <button className="btn-ghost hover:!text-chili-700" onClick={() => setConfirm(p)}><Icon name="trash" size={18} />{t('common.delete')}</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-3 border-t border-[var(--line)]"><Pagination page={page} pages={d.pages} total={d.total} onPage={(n) => set({ page: n })} /></div>
            </>
          )}
        </div>
      )}

      {confirm && <ConfirmDialog title={t('list.deleteTitle')} message={t('list.deleteMsg', { name: confirm.name })} busy={busy} onConfirm={doDelete} onClose={() => setConfirm(null)} />}
      {stockFor && <StockDialog product={stockFor} onClose={() => setStockFor(null)} onChanged={() => list.reload()} />}
    </div>
  );
}
