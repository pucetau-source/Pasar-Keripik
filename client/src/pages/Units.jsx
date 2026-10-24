import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog, DecInput, Empty, ErrorBox, Field, Modal, Skel, TextInput, useAsync, useToast } from '../components/ui.jsx';
import { api, ApiError, asList, normFields } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { num } from '../lib/format.js';

function UnitDialog({ unit, onClose, onSaved }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ name: unit?.name || '', symbol: unit?.symbol || '', to_base: unit?.to_base != null ? String(unit.to_base) : '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = t('v.required');
    if (!f.symbol.trim()) er.symbol = t('v.required');
    if (!(Number(f.to_base) > 0)) er.to_base = t('unit.errFactor');
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const body = { name: f.name.trim(), symbol: f.symbol.trim(), to_base: Number(f.to_base) };
    try {
      if (unit) await api.updateUnit(unit.id, body); else await api.createUnit(body);
      toast(t('unit.saved')); onSaved();
    } catch (e2) {
      const fl = e2 instanceof ApiError ? normFields(e2.fields) : {};
      setErr({ ...fl, _: Object.keys(fl).length ? '' : e2.message });
    } finally { setBusy(false); }
  }

  return (
    <Modal title={unit ? t('unit.edit') : t('unit.add')} onClose={onClose}
      footer={<><button className="btn-soft" onClick={onClose}>{t('common.cancel')}</button><button form="unitform" className="btn-primary" disabled={busy}>{busy ? t('common.wait') : t('common.save')}</button></>}>
      <form id="unitform" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('unit.name')} error={err.name} required htmlFor="un"><TextInput id="un" value={f.name} error={err.name} onChange={(e) => set('name')(e.target.value)} placeholder="Kilogram" /></Field>
          <Field label={t('unit.symbol')} error={err.symbol} required htmlFor="us"><TextInput id="us" value={f.symbol} error={err.symbol} onChange={(e) => set('symbol')(e.target.value)} placeholder="kg" maxLength={8} /></Field>
        </div>
        <Field label={t('unit.factor')} hint={t('unit.factorHint')} error={err.to_base} required htmlFor="uf"><DecInput id="uf" value={f.to_base} error={err.to_base} onChange={set('to_base')} /></Field>
        {err._ && <p className="field-error" role="alert">{err._}</p>}
      </form>
    </Modal>
  );
}

export default function Units() {
  const { t } = useI18n();
  const toast = useToast();
  const res = useAsync(() => api.units().then(asList), []);
  const [dlg, setDlg] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

  async function doDelete() {
    setBusy(true); setDelErr('');
    try { await api.deleteUnit(del.id); toast(t('unit.deleted')); setDel(null); res.reload(); }
    catch (e) { setDelErr(e.message); }
    finally { setBusy(false); }
  }
  const units = res.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{t('nav.units')}</h1>
          <p className="text-ink-soft">{t('unit.intro')}</p>
        </div>
        <button className="btn-primary" onClick={() => setDlg({})}><Icon name="plus" />{t('unit.add')}</button>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        {res.loading && !res.data && <div className="p-4 space-y-2">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-10" />)}</div>}
        {res.error && <div className="p-4"><ErrorBox error={res.error} onRetry={res.reload} /></div>}
        {res.data && units.length === 0 && <Empty icon="scale" title={t('unit.empty')} text={t('unit.emptyText')} action={<button className="btn-primary" onClick={() => setDlg({})}><Icon name="plus" />{t('unit.add')}</button>} />}
        {units.length > 0 && (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]"><tr><th className="th">{t('unit.name')}</th><th className="th">{t('unit.symbol')}</th><th className="th text-right">{t('unit.factorCol')}</th><th className="th"><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="td font-semibold">{u.name}</td>
                  <td className="td">{u.symbol}</td>
                  <td className="td text-right tabnum">{num(u.to_base)}{u.used_count > 0 && <span className="chip bg-cream-200 text-ink-soft ml-2">{t('unit.used', { n: u.used_count })}</span>}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="btn-icon" aria-label={t('common.edit') + ': ' + u.name} onClick={() => setDlg({ unit: u })}><Icon name="edit" /></button>
                    <button className="btn-icon hover:!text-chili-700" aria-label={t('common.delete') + ': ' + u.name} onClick={() => { setDelErr(''); setDel(u); }}><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {dlg && <UnitDialog unit={dlg.unit} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); res.reload(); }} />}
      {del && (
        <ConfirmDialog title={t('unit.deleteTitle')} busy={busy} onClose={() => setDel(null)} onConfirm={doDelete}
          message={<>{t('unit.deleteMsg', { name: del.name })}{delErr && <span className="field-error mt-3" role="alert"><Icon name="alert" size={14} className="mt-0.5" />{delErr}</span>}</>} />
      )}
    </div>
  );
}
