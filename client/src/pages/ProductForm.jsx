import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog, DecInput, ErrorBox, Field, NumInput, SectionCard, Skel, TextInput, Toggle, useAsync, useToast } from '../components/ui.jsx';
import Photos from '../components/product/Photos.jsx';
import { CategoryPicker, TagsInput } from '../components/product/Pickers.jsx';
import Variations from '../components/product/Variations.jsx';
import { Discounts, Wholesale } from '../components/product/Pricing.jsx';
import StockDialog from '../components/StockDialog.jsx';
import { api, ApiError, asList, normFields } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { ensureTree } from '../lib/tree.js';
import { emptyForm, fromApi, toApi } from '../lib/product.js';

function validate(f, t) {
  const e = {};
  if (!f.name.trim()) e.name = t('v.required');
  if (!f.category_id) e.category_id = t('v.categoryRequired');
  if (f.preorder && !(Number(f.preorder_days) > 0)) e.preorder_days = t('v.required');
  if (!(Number(f.min_purchase) >= 1)) e.min_purchase = t('v.min1');
  f.axes.forEach((a, i) => {
    const filled = a.options.filter((o) => o.value.trim());
    if (!a.name.trim()) e[`axes.${i}.name`] = t('v.required');
    if (!filled.length) e[`axes.${i}.options`] = t('v.needOption');
    const seen = new Set();
    a.options.forEach((o, j) => { const k = o.value.trim().toLowerCase(); if (k && seen.has(k)) e[`axes.${i}.options.${j}`] = e[`axes.${i}.options`] = t('v.dupOption'); seen.add(k); });
  });
  const skus = new Map();
  f.variants.forEach((v, i) => {
    if (!(Number(v.price) > 0)) e[`variants.${i}.price`] = t('v.price');
    if (!(Number(v.weight_value) > 0)) e[`variants.${i}.weight_value`] = t('v.weight');
    if (v.weight_unit_id === '') e[`variants.${i}.weight_unit_id`] = t('v.unit');
    const s = v.sku.trim().toLowerCase();
    if (s) { if (skus.has(s)) e[`variants.${i}.sku`] = t('v.dupSku'); skus.set(s, i); }
  });
  return e;
}

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setFormRaw] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [topError, setTopError] = useState('');
  const [focusTick, setFocusTick] = useState(0);
  const loaded = useRef(false);

  const setForm = useCallback((u) => { setDirty(true); setFormRaw(u); }, []);
  const upd = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; }); };
  const err = useCallback((p) => errors[p], [errors]);

  const product = useAsync(() => (isNew ? Promise.resolve(null) : api.product(id)), [id]);
  const cats = useAsync(() => api.categories().then((d) => ensureTree(d?.categories || d)), []);
  const units = useAsync(() => api.units().then(asList), []);

  useEffect(() => {
    if (product.data && !loaded.current) { setFormRaw(fromApi(product.data)); setDirty(false); loaded.current = true; }
  }, [product.data]);
  useEffect(() => { loaded.current = false; if (isNew) { setFormRaw(emptyForm()); setDirty(false); } }, [id, isNew]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const reloadProduct = useCallback(async () => {
    const d = fromApi(await api.product(id));
    setFormRaw((f) => ({ ...f, variants: f.variants.map((v) => ({ ...v, discounts: d.variants.find((x) => x.id === v.id)?.discounts ?? v.discounts })) }));
  }, [id]);

  async function save(e) {
    e?.preventDefault();
    setTopError('');
    const ve = validate(form, t);
    setErrors(ve);
    if (Object.keys(ve).length) { toast(t('form.fixErrors'), 'err'); setFocusTick((n) => n + 1); return; }
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.createProduct(toApi(form, true));
        const created = res?.product || res;
        const pid = created.id;
        let warn = '';
        try {
          const files = form.images.filter((i) => i.blob).map((i) => i.blob);
          if (files.length) await api.uploadImages(pid, files);
          const staged = form.stagedDiscounts || [];
          if (staged.length) {
            const vars = created.variants?.length ? created.variants : fromApi(await api.product(pid)).variants;
            for (const s of staged) {
              const body = { price: s.price, percent: s.percent, starts_at: s.starts_at, ends_at: s.ends_at, ...(s.scope === 'all' ? {} : { variant_ids: [vars[Number(s.scope)]?.id] }) };
              await api.addDiscount(pid, body);
            }
          }
        } catch (x) { warn = x.message; }
        setDirty(false);
        toast(warn ? t('form.createdWarn', { msg: warn }) : t('form.created'), warn ? 'err' : 'ok');
        nav(`/products/${pid}`, { replace: true });
      } else {
        await api.updateProduct(id, toApi(form, false));
        setDirty(false);
        toast(t('form.saved'));
        loaded.current = false; product.reload();
      }
    } catch (x) {
      if (x instanceof ApiError) {
        const f = normFields(x.fields);
        setErrors(f);
        setTopError(x.message);
        setFocusTick((n) => n + 1);
      } else setTopError(x.message);
      toast(x.message, 'err');
    } finally { setSaving(false); }
  }

  // After errors are rendered: scroll to and focus the first invalid field (DOM order)
  useEffect(() => {
    if (!focusTick) return;
    const h = setTimeout(() => {
      let el = document.querySelector('form [aria-invalid="true"]');
      if (!el) {
        const msg = document.querySelector('form .field-error');
        el = msg?.parentElement?.querySelector('input,select,textarea,button[role="combobox"],button') || msg;
      }
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      if (typeof el.focus === 'function') { if (el.tabIndex < 0 && !/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(el.tagName)) el.tabIndex = -1; el.focus({ preventScroll: true }); }
    }, 0);
    return () => clearTimeout(h);
  }, [focusTick]);

  async function doDelete() {
    try { await api.deleteProduct(id); setDirty(false); toast(t('list.deleted', { name: form.name })); nav('/', { replace: true }); }
    catch (x) { toast(x.message, 'err'); setDelOpen(false); }
  }

  const cattree = useMemo(() => cats.data || [], [cats.data]);

  if (!isNew && product.error) return <ErrorBox error={product.error} onRetry={product.reload} />;
  if (!isNew && product.loading && !loaded.current && !product.data) {
    return <div className="space-y-4" aria-busy="true"><Skel className="h-10 w-72" /><Skel className="h-56" /><Skel className="h-72" /><Skel className="h-56" /></div>;
  }

  const unitsList = units.data || [];

  return (
    <form onSubmit={save} noValidate className="space-y-3 pb-20">
      <div>
        <Link to="/" className="btn-ghost -ml-2 !min-h-[28px]" onClick={(e) => { if (dirty && !window.confirm(t('form.leave'))) e.preventDefault(); }}><Icon name="chevL" size={18} />{t('nav.products')}</Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{isNew ? t('form.titleNew') : t('form.titleEdit')}</h1>
          {!isNew && (
            <div className="flex gap-2 flex-wrap">
              <Link to={`/products/${id}/audit`} className="btn-soft"><Icon name="history" size={18} />{t('list.history')}</Link>
              <button type="button" className="btn-soft hover:!text-chili-700" onClick={() => setDelOpen(true)}><Icon name="trash" size={18} />{t('common.delete')}</button>
            </div>
          )}
        </div>
        {topError && <p className="field-error mt-2 text-sm" role="alert"><Icon name="alert" size={16} className="mt-0.5" />{topError}</p>}
      </div>

      <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)] items-start">
        <div className="space-y-3">
      <SectionCard id="photos" title={t('sec.photos')} hint={t('sec.photosHint')}>
        <Photos productId={isNew ? null : id} images={form.images} onChange={(imgs) => { setFormRaw((f) => ({ ...f, images: imgs })); if (isNew) setDirty(true); }} error={err('images')} />
      </SectionCard>
      <SectionCard id="dims" title={t('sec.dims')} hint={t('sec.dimsHint')}>
        <div className="grid grid-cols-3 gap-2.5">
          {[['length_cm', 'form.length'], ['width_cm', 'form.width'], ['height_cm', 'form.height']].map(([k, l]) => (
            <Field key={k} label={t(l)} error={err(k)} htmlFor={k}>
              <div className="relative"><DecInput id={k} value={form[k]} error={err(k)} onChange={upd(k)} className="!pr-10" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-mute">cm</span></div>
            </Field>
          ))}
        </div>
      </SectionCard>
        </div>
      <SectionCard id="info" title={t('sec.info')}>
        <div className="grid gap-4">
          <Field label={t('form.name')} error={err('name')} required htmlFor="pname" hint={`${form.name.length}/120`}>
            <TextInput id="pname" value={form.name} error={err('name')} maxLength={120} onChange={(e) => upd('name')(e.target.value)} placeholder={t('form.namePh')} />
          </Field>
          <Field label={t('form.desc')} error={err('description')} htmlFor="pdesc">
            <textarea id="pdesc" className="input min-h-[120px]" rows={5} value={form.description} aria-invalid={err('description') ? 'true' : undefined} onChange={(e) => upd('description')(e.target.value)} maxLength={3000} />
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={t('form.category')} error={err('category_id')} required htmlFor="pcat">
              {cats.loading && !cats.data ? <Skel className="h-[42px]" /> : <CategoryPicker id="pcat" tree={cattree} value={form.category_id} error={err('category_id')} onChange={upd('category_id')} />}
              {!cats.loading && cattree.length === 0 && <p className="field-hint"><Link className="underline text-chili-700 font-semibold" to="/categories">{t('form.categoryCreate')}</Link></p>}
            </Field>
            <Field label={t('form.tags')} error={err('tags')} htmlFor="ptags"><TagsInput id="ptags" tags={form.tags} onChange={upd('tags')} /></Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={t('form.condition')} error={err('condition')}>
              <div className="inline-flex rounded-lg border border-[var(--input-border)] overflow-hidden" role="radiogroup" aria-label={t('form.condition')}>
                {['new', 'used'].map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={form.condition === c} onClick={() => upd('condition')(c)}
                    className={'px-5 min-h-[38px] font-semibold ' + (form.condition === c ? 'bg-chili-600 text-white' : 'bg-surface text-ink-soft hover:bg-sunken')}>{t('cond.' + c)}</button>
                ))}
              </div>
            </Field>
            <Field label={t('form.status')} hint={t('form.statusHint')}>
              <Toggle checked={form.status === 'active'} onChange={(x) => upd('status')(x ? 'active' : 'inactive')} label={form.status === 'active' ? t('status.active') : t('status.inactive')} />
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={t('form.preorder')} hint={t('form.preorderHint')}>
              <div className="flex items-center gap-4 flex-wrap">
                <Toggle checked={form.preorder} onChange={upd('preorder')} label={form.preorder ? t('common.yes') : t('common.no')} />
                {form.preorder && (
                  <div className="flex items-center gap-2"><NumInput className="!w-24" aria-label={t('form.preorderDays')} value={form.preorder_days} error={err('preorder_days')} max={365} onChange={upd('preorder_days')} /><span className="text-ink-soft">{t('form.days')}</span></div>
                )}
              </div>
              {err('preorder_days') && <p className="field-error" role="alert">{err('preorder_days')}</p>}
            </Field>
            <Field label={t('form.minPurchase')} error={err('min_purchase')} hint={t('form.minPurchaseHint')} htmlFor="pmin">
              <NumInput id="pmin" className="!w-32" value={form.min_purchase} error={err('min_purchase')} onChange={upd('min_purchase')} />
            </Field>
          </div>
        </div>
      </SectionCard>
      </div>

      <SectionCard id="variations" title={t('sec.variations')} hint={t('sec.variationsHint')}>
        <Variations form={form} setForm={setForm} units={unitsList} err={err} isNew={isNew} onStock={() => setStockOpen(true)} />
        {units.data && unitsList.length === 0 && <p className="field-hint mt-2"><Link to="/units" className="underline text-chili-700 font-semibold">{t('var.unitsCreate')}</Link></p>}
      </SectionCard>

      <div className="grid gap-3 xl:grid-cols-2 items-start">
      <SectionCard id="wholesale" title={t('sec.wholesale')} hint={t('sec.wholesaleHint')}>
        <Wholesale form={form} setForm={setForm} err={err} />
      </SectionCard>

      <SectionCard id="discounts" title={t('sec.discounts')} hint={t('sec.discountsHint')}>
        <Discounts form={form} setForm={setForm} productId={isNew ? null : id} onReload={reloadProduct} err={err} />
      </SectionCard>
      </div>

      <div className="fixed bottom-[60px] md:bottom-0 inset-x-0 z-30 md:pl-[88px] lg:pl-[256px]">
        <div className="frost md:mx-6 md:mb-3 md:rounded-xl px-3 py-2 flex items-center justify-between gap-3 max-w-[1512px] md:mx-auto md:w-[calc(100%-3rem)]">
          <span className="text-sm text-ink-soft hidden sm:inline">{dirty ? t('form.unsaved') : isNew ? '' : t('form.upToDate')}</span>
          <div className="flex gap-2 ml-auto">
            <button type="button" className="btn-soft" onClick={() => { if (!dirty || window.confirm(t('form.leave'))) nav('/'); }}>{t('common.cancel')}</button>
            <button className="btn-primary min-w-[8rem]" disabled={saving}>{saving ? t('common.wait') : t('form.create')}</button>
          </div>
        </div>
      </div>

      {stockOpen && <StockDialog product={{ id, name: form.name }} onClose={() => setStockOpen(false)} onChanged={(vid, stock) => setFormRaw((f) => ({ ...f, variants: f.variants.map((v) => (v.id === vid ? { ...v, stock } : v)) }))} />}
      {delOpen && <ConfirmDialog title={t('list.deleteTitle')} message={t('list.deleteMsg', { name: form.name })} onConfirm={doDelete} onClose={() => setDelOpen(false)} />}
    </form>
  );
}
