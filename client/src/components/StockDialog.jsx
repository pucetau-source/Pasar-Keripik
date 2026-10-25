import { useEffect, useState } from 'react';
import Select from './Select.jsx';
import { Modal, Field, TextInput, Skel, useToast } from './ui.jsx';
import Icon from './Icon.jsx';
import { api, asList, ApiError } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { fmtWib, int } from '../lib/format.js';
import { fromApi, variantLabel } from '../lib/product.js';

// product: {id,name}. Loads variants itself so it works from list and form.
export default function StockDialog({ product, onClose, onChanged }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [variants, setVariants] = useState(null);
  const [vid, setVid] = useState(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const [loadErr, setLoadErr] = useState(null);
  const [labels, setLabels] = useState({});
  useEffect(() => { api.settings().then((s0) => setLabels(s0?.stock_reason_labels || {})).catch(() => {}); }, []);

  useEffect(() => {
    api.product(product.id).then((d) => {
      const f = fromApi(d);
      const vs = f.variants.map((v) => ({ ...v, label: variantLabel(v, f.axes) }));
      setVariants(vs); setVid(vs[0]?.id ?? null);
    }).catch(setLoadErr);
  }, [product.id]);

  const loadHist = (id) => { setHist(null); api.stockMovements(id).then((d) => setHist(asList(d))).catch(() => setHist([])); };
  useEffect(() => { if (vid) loadHist(vid); }, [vid]);

  const cur = variants?.find((v) => v.id === vid);
  const n = delta === '' || delta === '-' || delta === '+' ? NaN : Number(delta);
  const after = cur && !Number.isNaN(n) ? Number(cur.stock) + n : null;

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (!Number.isInteger(n) || n === 0) er.qty_change = t('stock.errQty');
    if (after != null && after < 0) er.qty_change = t('stock.errNegative');
    if (!reason.trim()) er.reason = t('stock.errReason');
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const res = await api.adjustStock(vid, { qty_change: n, reason: reason.trim(), note: note.trim() || undefined });
      const newStock = res?.stock ?? after;
      setVariants((vs) => vs.map((v) => (v.id === vid ? { ...v, stock: newStock } : v)));
      setDelta(''); setNote('');
      toast(t('stock.saved'));
      loadHist(vid);
      onChanged?.(vid, newStock);
    } catch (e2) {
      if (e2 instanceof ApiError && e2.fields) setErr({ qty_change: e2.fields.qty_change, reason: e2.fields.reason, _: e2.message });
      else setErr({ _: e2.message });
    } finally { setBusy(false); }
  }

  return (
    <Modal title={t('stock.title')} onClose={onClose} wide>
      <p className="text-ink-soft mb-3 -mt-1">{product.name}</p>
      {loadErr && <p className="field-error">{loadErr.message}</p>}
      {!variants && !loadErr && <div className="space-y-2"><Skel className="h-10" /><Skel className="h-24" /></div>}
      {variants && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={submit} className="space-y-3" noValidate>
            {variants.length > 1 && (
              <Field label={t('stock.variant')} htmlFor="sv">
                <Select id="sv" value={vid ?? ''} onChange={(x) => setVid(Number(x))}
                  options={variants.map((v) => ({ value: v.id, label: v.label || v.sku || '#' + v.id }))} />
              </Field>
            )}
            <div className="panel p-3 flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">{t('stock.current')}</span>
              <span className="text-2xl font-bold tabnum">{int(cur?.stock)}</span>
            </div>
            <Field label={t('stock.change')} hint={t('stock.changeHint')} error={err.qty_change} htmlFor="sd">
              <div className="flex gap-2">
                <button type="button" className="btn-soft px-3" aria-label="-1" onClick={() => setDelta(String((Number.isNaN(n) ? 0 : n) - 1))}><Icon name="minus" size={16} /></button>
                <TextInput id="sd" inputMode="numeric" value={delta} error={err.qty_change} onChange={(e) => setDelta(e.target.value.replace(/[^\d+-]/g, ''))} placeholder="+10 / -3" className="text-center tabnum" />
                <button type="button" className="btn-soft px-3" aria-label="+1" onClick={() => setDelta(String((Number.isNaN(n) ? 0 : n) + 1))}><Icon name="plus" size={16} /></button>
              </div>
              {after != null && <p className="text-sm mt-1.5">{t('stock.after')}: <b className={'tabnum ' + (after < 0 ? 'text-danger-700' : '')}>{int(after)}</b></p>}
            </Field>
            <Field label={t('stock.reason')} error={err.reason} htmlFor="sr" required>
              <TextInput id="sr" list="stock-reasons" value={reason} error={err.reason} onChange={(e) => setReason(e.target.value)} placeholder={t('stock.reasonPh')} maxLength={80} />
              <datalist id="stock-reasons">{[...new Set((hist || []).map((h) => h.reason))].filter(Boolean).map((r) => <option key={r} value={r} />)}</datalist>
            </Field>
            <Field label={t('stock.note')} htmlFor="sn">
              <TextInput id="sn" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </Field>
            {err._ && <p className="field-error" role="alert">{err._}</p>}
            <button className="btn-primary w-full" disabled={busy || !cur}>{busy ? t('common.wait') : t('stock.save')}</button>
          </form>

          <div>
            <h3 className="font-bold mb-2">{t('stock.history')}</h3>
            {!hist && <div className="space-y-2"><Skel className="h-12" /><Skel className="h-12" /></div>}
            {hist && hist.length === 0 && <p className="text-ink-soft text-sm panel p-4">{t('stock.noHistory')}</p>}
            {hist && hist.length > 0 && (
              <ul className="space-y-2 max-h-80 overflow-y-auto scroll-thin pr-1">
                {hist.map((h, i) => (
                  <li key={h.id ?? i} className="panel px-3 py-2 flex items-start gap-3">
                    <span className="min-w-[3.5rem] text-center">
                      <span className={'tabnum font-bold text-lg block leading-tight ' + (h.qty_change < 0 ? 'text-danger-700' : 'text-ok-700')}>{h.qty_change > 0 ? '+' : ''}{int(h.qty_change)}</span>
                      {h.stock_after != null && <span className="tabnum text-xs text-ink-mute block">{t('stock.balance', { n: int(h.stock_after) })}</span>}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="font-semibold block break-words">{labels[h.reason]?.[lang] || h.reason}{h.source && h.source !== 'admin' ? ` (${h.source})` : ''}</span>
                      {h.note && <span className="block text-ink-soft break-words">{h.note}</span>}
                      <span className="block text-ink-mute text-xs">{fmtWib(h.created_at, lang)}{h.created_by?.name ? ' · ' + h.created_by.name : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
