import { useMemo, useState } from 'react';
import Select from '../Select.jsx';
import Icon from '../Icon.jsx';
import { ConfirmDialog, Field, Money, NumInput, useToast } from '../ui.jsx';
import { api } from '../../lib/api.js';
import { fmtWib, inputToWib, rupiah } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';
import { variantLabel } from '../../lib/product.js';

/* ================= Wholesale ================= */
export function Wholesale({ form, setForm, err }) {
  const { t } = useI18n();
  const vs = form.variants;
  const sig = (v) => JSON.stringify(v.tiers.map((x) => [x.min_qty, vs.length > 1 && Number(v.price) > 0 && x.price !== '' ? Math.round((1 - Number(x.price) / Number(v.price)) * 100) : x.price]));
  const same = vs.every((v) => sig(v) === sig(vs[0]));
  const [scope, setScope] = useState(vs.length > 1 && !same ? 0 : 'all');
  const idx = scope === 'all' ? 0 : Math.min(Number(scope), vs.length - 1);
  // "All variants" works in percent (each variant keeps a fitting price); a fixed price only makes sense for one variant.
  const pctMode = scope === 'all' && vs.length > 1;
  const tiers = vs[idx].tiers;
  const setTiers = (next) => setForm((f) => ({ ...f, variants: f.variants.map((v, k) => (scope === 'all' || k === idx ? { ...v, tiers: next } : v)) }));
  const priceFor = (v, pct) => (pct === '' || !(Number(v.price) > 0) ? '' : Math.round(Number(v.price) * (1 - Number(pct) / 100)));
  const setPctTiers = (list) => setForm((f) => ({
    ...f,
    variants: f.variants.map((v) => ({ ...v, tiers: list.map((x) => ({ min_qty: x.min_qty, pct: x.pct, price: priceFor(v, x.pct) })) })),
  }));
  const pctOf = (x) => {
    if (x.pct !== undefined && x.pct !== '') return x.pct;
    const p0 = Number(vs[0].price);
    return x.price !== '' && p0 > 0 ? Math.max(1, Math.round((1 - Number(x.price) / p0) * 100)) : '';
  };
  const rows = pctMode ? tiers.map((x) => ({ ...x, pct: pctOf(x) })) : tiers;
  const upd = (i, patch) => (pctMode ? setPctTiers(rows.map((x, k) => (k === i ? { ...x, ...patch } : x))) : setTiers(tiers.map((x, k) => (k === i ? { ...x, ...patch } : x))));
  const prices = (scope === 'all' ? vs : [vs[idx]]).map((v) => Number(v.price)).filter((p) => p > 0);
  const minQ = Math.max(2, Number(form.min_purchase || 1) + 1);
  const base = prices.length ? Math.min(...prices) : null;

  const msg = (x, i) => {
    if (x.min_qty !== '' && Number(x.min_qty) < minQ) return t('ws.errMin', { min: minQ });
    const prev = rows[i - 1];
    if (pctMode) {
      if (x.pct !== '' && (Number(x.pct) < 1 || Number(x.pct) > 99)) return t('disc.errPercent');
      if (prev && x.pct !== '' && prev.pct !== '' && Number(x.pct) <= Number(prev.pct)) return t('ws.errPctUp');
    } else {
      if (x.price !== '' && base != null && Number(x.price) >= base) return t('ws.errLower', { price: rupiah(base) });
      if (prev && x.price !== '' && prev.price !== '' && Number(x.price) >= Number(prev.price)) return t('ws.errDown');
    }
    if (prev && x.min_qty !== '' && prev.min_qty !== '' && Number(x.min_qty) <= Number(prev.min_qty)) return t('ws.errQtyUp');
    return '';
  };
  const resultHint = (x) => {
    if (!pctMode || x.pct === '') return undefined;
    const ps = vs.map((v) => priceFor(v, x.pct)).filter((p) => p !== '');
    if (!ps.length) return undefined;
    const lo = Math.min(...ps), hi = Math.max(...ps);
    return t('ws.result', { price: lo === hi ? rupiah(lo) : `${rupiah(lo)} - ${rupiah(hi)}` });
  };

  return (
    <div className="space-y-3">
      {vs.length > 1 && (
        <Field label={t('ws.scope')} htmlFor="wsscope">
          <Select id="wsscope" className="sm:max-w-sm" value={scope} onChange={(x) => setScope(x === 'all' ? 'all' : Number(x))}
            options={[{ value: 'all', label: t('ws.all') }, ...vs.map((v, i) => ({ value: i, label: variantLabel(v, form.axes) }))]} />
          {scope === 'all' && !same && <p className="field-hint text-danger-700">{t('ws.differ')}</p>}
          <p className="field-hint">{pctMode ? t('ws.allExplain') : t('ws.oneExplain')}</p>
        </Field>
      )}
      {rows.length === 0 && <p className="text-ink-soft text-sm panel p-4">{t('ws.empty')}</p>}
      {rows.map((x, i) => {
        const m = msg(x, i) || err(`variants.${idx}.wholesale.${i}.price`) || err(`variants.${idx}.wholesale.${i}.min_qty`);
        return (
          <div key={i} className="panel p-3">
            <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2 items-end">
              <Field label={t('ws.minQty')} htmlFor={`wq${i}`}><NumInput id={`wq${i}`} value={x.min_qty} error={m} onChange={(v) => upd(i, { min_qty: v })} /></Field>
              {pctMode
                ? <Field label={t('ws.percent')} htmlFor={`wp${i}`}><NumInput id={`wp${i}`} value={x.pct} max={99} error={m} placeholder="10" onChange={(v) => upd(i, { pct: v })} /></Field>
                : <Field label={t('ws.price')} htmlFor={`wp${i}`}><Money id={`wp${i}`} value={x.price} error={m} onChange={(v) => upd(i, { price: v })} /></Field>}
              <button type="button" className="btn-icon hover:!text-danger-700 mb-0.5" aria-label={t('common.delete')} onClick={() => (pctMode ? setPctTiers(rows.filter((_, k) => k !== i)) : setTiers(tiers.filter((_, k) => k !== i)))}><Icon name="trash" /></button>
            </div>
            {m ? <p className="field-error" role="alert"><Icon name="alert" size={14} className="mt-0.5" />{m}</p> : resultHint(x) && <p className="field-hint">{resultHint(x)}</p>}
          </div>
        );
      })}
      <button type="button" className="btn-soft" onClick={() => {
        const nq = rows.length ? Number(rows[rows.length - 1].min_qty || 1) + 5 : 5;
        if (pctMode) setPctTiers([...rows, { min_qty: nq, pct: '' }]); else setTiers([...tiers, { min_qty: nq, price: '' }]);
      }}><Icon name="plus" size={16} />{t('ws.add')}</button>
    </div>
  );
}

/* ================= Discounts ================= */
function groupExisting(variants) {
  const rows = variants.flatMap((v, i) => v.discounts.map((d) => ({ ...d, vi: i })));
  const groups = []; const seen = new Map();
  for (const d of rows) {
    if (d.batch_id) {
      if (seen.has(d.batch_id)) { const g = seen.get(d.batch_id); g.ids.push(d.id); g.vis.push(d.vi); g.price = Math.min(g.price, d.price); g.pmax = Math.max(g.pmax, d.price); continue; }
      const g = { ids: [d.id], vis: [d.vi], batch: true, price: d.price, pmax: d.price, starts_at: d.starts_at, ends_at: d.ends_at };
      seen.set(d.batch_id, g); groups.push(g);
    } else groups.push({ ids: [d.id], vis: [d.vi], batch: false, price: d.price, starts_at: d.starts_at, ends_at: d.ends_at });
  }
  return groups;
}

export function Discounts({ form, setForm, productId, onReload, err }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const vs = form.variants;
  const [scope, setScope] = useState('all');
  const [mode0, setMode] = useState('price');
  const [val, setVal] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [e, setE] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const existing = useMemo(() => groupExisting(vs), [vs]);
  const staged = form.stagedDiscounts || [];
  const labelOf = (vis) => (vis.length === vs.length && vs.length > 1 ? t('disc.allVariants') : vis.map((i) => variantLabel(vs[i], form.axes) || t('var.single')).join(', '));

  const allMode = scope === 'all' && vs.length > 1; // fixed promo price only for a single variant
  const mode = allMode ? 'percent' : mode0;
  const targets = scope === 'all' ? vs : [vs[Number(scope)]];
  const minPrice = Math.min(...targets.map((v) => Number(v.price) || Infinity));
  const calc = mode === 'percent' ? Math.round(minPrice * (1 - Number(val) / 100)) : Number(val);

  function validate() {
    const er = {};
    if (val === '' || Number(val) <= 0) er.val = t('v.required');
    else if (mode === 'percent' && Number(val) >= 100) er.val = t('disc.errPercent');
    else if (mode === 'price' && Number.isFinite(minPrice) && Number(val) >= minPrice) er.val = t('disc.errLower', { price: rupiah(minPrice) });
    if (!from) er.from = t('v.required');
    if (!to) er.to = t('v.required');
    if (from && to && inputToWib(from) >= inputToWib(to)) er.to = t('disc.errRange');
    setE(er);
    return !Object.keys(er).length;
  }

  async function add() {
    if (!validate()) return;
    const payload = { price: mode === 'price' ? Number(val) : undefined, percent: mode === 'percent' ? Number(val) : undefined, starts_at: inputToWib(from), ends_at: inputToWib(to) };
    if (!productId) {
      setForm((f) => ({ ...f, stagedDiscounts: [...(f.stagedDiscounts || []), { scope, ...payload, label: scope === 'all' ? t('disc.allVariants') : variantLabel(vs[Number(scope)], form.axes) || t('var.single') }] }));
      setVal(''); setFrom(''); setTo(''); setE({});
      return;
    }
    setBusy(true);
    try {
      const vid = scope === 'all' ? null : vs[Number(scope)].id;
      await api.addDiscount(productId, scope === 'all' ? payload : { ...payload, variant_ids: [vid] });
      toast(t('disc.added'));
      setVal(''); setFrom(''); setTo(''); setE({});
      await onReload();
    } catch (x) {
      setE({ val: x.fields?.price || x.fields?.percent || x.fields?.variant_ids, from: x.fields?.starts_at, to: x.fields?.ends_at, _: x.message });
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteDiscount(del.ids[0], del.batch);
      toast(t('disc.removed')); setDel(null); await onReload();
    } catch (x) { toast(x.message, 'err'); setDel(null); }
    finally { setBusy(false); }
  }

  const noPrice = vs.every((v) => !(Number(v.price) > 0));

  return (
    <div className="space-y-4">
      {(existing.length > 0 || staged.length > 0) && (
        <ul className="space-y-2">
          {existing.map((g) => (
            <li key={g.ids.join()} className="panel p-3 flex items-start gap-3">
              <Icon name="percent" className="text-brand-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{g.pmax > g.price ? `${rupiah(g.price)} - ${rupiah(g.pmax)}` : rupiah(g.price)}<span className="font-normal text-ink-soft"> · {labelOf(g.vis)}</span></p>
                <p className="text-sm text-ink-soft">{fmtWib(g.starts_at, lang)} &rarr; {fmtWib(g.ends_at, lang)}</p>
              </div>
              <button type="button" className="btn-icon hover:!text-danger-700" aria-label={t('common.delete')} onClick={() => setDel(g)}><Icon name="trash" /></button>
            </li>
          ))}
          {staged.map((s, i) => (
            <li key={'s' + i} className="panel p-3 flex items-start gap-3 border-dashed">
              <Icon name="percent" className="text-brand-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{s.percent ? `${s.percent}%` : rupiah(s.price)} <span className="font-normal text-ink-soft">· {s.label}</span> <span className="chip bg-brand-100 text-ink">{t('disc.staged')}</span></p>
                <p className="text-sm text-ink-soft">{fmtWib(s.starts_at, lang)} &rarr; {fmtWib(s.ends_at, lang)}</p>
              </div>
              <button type="button" className="btn-icon hover:!text-danger-700" aria-label={t('common.delete')} onClick={() => setForm((f) => ({ ...f, stagedDiscounts: f.stagedDiscounts.filter((_, k) => k !== i) }))}><Icon name="trash" /></button>
            </li>
          ))}
        </ul>
      )}
      {existing.length === 0 && staged.length === 0 && <p className="text-ink-soft text-sm panel p-4">{t('disc.empty')}</p>}

      <div className="panel p-4 space-y-3">
        <h3 className="font-bold">{t('disc.new')}</h3>
        {noPrice && <p className="field-hint text-danger-700">{t('disc.needPrice')}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {vs.length > 1 && (
            <Field label={t('disc.scope')} htmlFor="dsc" hint={allMode ? t('disc.allExplain') : undefined}>
              <Select id="dsc" value={scope} onChange={(x) => setScope(String(x))}
                options={[{ value: 'all', label: t('disc.allVariants') }, ...vs.map((v, i) => ({ value: i, label: variantLabel(v, form.axes) }))]} />
            </Field>
          )}
          <Field label={t('disc.type')}>
            <div className="seg" role="group" aria-label={t('disc.type')}>
              {(allMode ? ['percent'] : ['price', 'percent']).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setVal(''); }}
                  className="px-4">{m === 'price' ? t('disc.byPrice') : t('disc.byPercent')}</button>
              ))}
            </div>
          </Field>
          <Field label={mode === 'price' ? t('disc.price') : t('disc.percent')} error={e.val} htmlFor="dval"
            hint={mode === 'percent' && val && Number.isFinite(calc) && Number.isFinite(minPrice) ? t('disc.result', { price: rupiah(calc) }) : undefined}>
            {mode === 'price' ? <Money id="dval" value={val} error={e.val} onChange={setVal} /> : <NumInput id="dval" value={val} error={e.val} max={99} onChange={setVal} placeholder="10" />}
          </Field>
          <div className="hidden sm:block" />
          <Field label={t('disc.from')} error={e.from} htmlFor="dfrom" hint={t('disc.wibHint')}>
            <input id="dfrom" type="datetime-local" step="60" className="input" aria-invalid={e.from ? 'true' : undefined} value={from} onChange={(x) => setFrom(x.target.value)} />
          </Field>
          <Field label={t('disc.to')} error={e.to} htmlFor="dto" hint={t('disc.wibHint')}>
            <input id="dto" type="datetime-local" step="60" className="input" aria-invalid={e.to ? 'true' : undefined} value={to} min={from || undefined} onChange={(x) => setTo(x.target.value)} />
          </Field>
        </div>
        {e._ && <p className="field-error" role="alert"><Icon name="alert" size={14} className="mt-0.5" />{e._}</p>}
        <button type="button" className="btn-primary" disabled={busy || noPrice} onClick={add}><Icon name="plus" size={18} />{productId ? t('disc.add') : t('disc.stage')}</button>
        {!productId && <p className="field-hint">{t('disc.stageHint')}</p>}
      </div>
      {del && <ConfirmDialog title={t('disc.deleteTitle')} message={t('disc.deleteMsg')} busy={busy} onConfirm={remove} onClose={() => setDel(null)} />}
    </div>
  );
}
