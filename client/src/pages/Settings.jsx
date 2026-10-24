import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import { Field, NumInput, PageHeader, TextInput, useToast } from '../components/ui.jsx';
import { api, ApiError, normFields } from '../lib/api.js';
import { useI18n, LANGS } from '../lib/i18n.jsx';
import { useSettings } from '../lib/settings.jsx';
import { useTheme } from '../lib/theme.jsx';

const THEME_OPTS = [['system', 'set.themeSystem', 'monitor'], ['light', 'set.themeLight', 'sun'], ['dark', 'set.themeDark', 'moon']];

export default function Settings() {
  const { t } = useI18n();
  const toast = useToast();
  const S = useSettings();
  const { pref, setPref } = useTheme();
  const fileRef = useRef(null);
  const [f, setF] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  // Fill the form once the settings are loaded (and again after a save returns fresh values)
  useEffect(() => {
    if (!S.raw) return;
    setF((cur) => cur || { shop_name: S.shopName, tagline: S.tagline, low_stock_threshold: S.threshold, default_language: S.defaultLang || 'id' });
  }, [S.raw, S.shopName, S.tagline, S.threshold, S.defaultLang]);

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (!f.shop_name.trim()) er.shop_name = t('v.required');
    if (f.low_stock_threshold === '' || !(Number(f.low_stock_threshold) >= 0)) er.low_stock_threshold = t('set.errNum');
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const res = await api.updateSettings({
        shop_name: f.shop_name.trim(), tagline: f.tagline.trim(),
        low_stock_threshold: Number(f.low_stock_threshold), default_language: f.default_language,
      });
      S.apply(res);
      toast(t('set.saved'));
    } catch (x) {
      const fl = x instanceof ApiError ? normFields(x.fields) : {};
      setErr(fl);
      toast(x.message, 'err');
    } finally { setBusy(false); }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    try { await api.uploadLogo(file); api.invalidateSettings(); S.apply(await api.settings()); toast(t('set.logoSaved')); }
    catch (x) { toast(x.message, 'err'); }
    finally { setLogoBusy(false); }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try { await api.deleteLogo(); api.invalidateSettings(); S.apply(await api.settings()); toast(t('set.logoRemoved')); }
    catch (x) { toast(x.message, 'err'); }
    finally { setLogoBusy(false); }
  }

  return (
    <form onSubmit={save} noValidate>
      <PageHeader subtitle={t('set.subtitle')}>
        <button className="btn-primary" disabled={busy || !f}>{busy ? t('common.wait') : t('common.save')}</button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <section className="glass rounded-2xl p-4" aria-labelledby="s-shop">
          <h2 id="s-shop" className="text-base font-bold">{t('set.shop')}</h2>
          <p className="text-[13px] text-ink-soft mb-3">{t('set.shopHint')}</p>

          <div className="flex items-center gap-3 mb-3.5">
            <span className="w-16 h-16 rounded-xl border border-[var(--line)] bg-sunken grid place-items-center shrink-0"><Logo size={48} /></span>
            <div className="min-w-0">
              <p className="field-label !mb-0.5">{t('set.logo')}</p>
              <p className="text-xs text-ink-mute mb-1.5">{S.logoUrl ? t('set.logoHint') : `${t('set.logoDefault')}. ${t('set.logoHint')}`}</p>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} aria-label={t('set.logoUpload')} tabIndex={-1} />
                <button type="button" className="btn-soft !min-h-[34px]" disabled={logoBusy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />{S.logoUrl ? t('set.logoChange') : t('set.logoUpload')}</button>
                {S.logoUrl && <button type="button" className="btn-ghost hover:!text-danger-700" disabled={logoBusy} onClick={removeLogo}><Icon name="trash" size={16} />{t('set.logoRemove')}</button>}
              </div>
            </div>
          </div>

          {f && (
            <div className="grid gap-3.5">
              <Field label={t('set.name')} error={err.shop_name} required htmlFor="sn"><TextInput id="sn" value={f.shop_name} error={err.shop_name} maxLength={60} onChange={(e) => set('shop_name')(e.target.value)} /></Field>
              <Field label={t('set.tagline')} error={err.tagline} htmlFor="st"><TextInput id="st" value={f.tagline} error={err.tagline} maxLength={80} onChange={(e) => set('tagline')(e.target.value)} /></Field>
            </div>
          )}
        </section>

        <section className="glass rounded-2xl p-4" aria-labelledby="s-pref">
          <h2 id="s-pref" className="text-base font-bold">{t('set.prefs')}</h2>
          <p className="text-[13px] text-ink-soft mb-3">{t('set.prefsHint')}</p>
          <div className="grid gap-3.5">
            {f && (
              <Field label={t('set.threshold')} hint={t('set.thresholdHint')} error={err.low_stock_threshold} htmlFor="sl">
                <NumInput id="sl" className="!w-28" value={f.low_stock_threshold} error={err.low_stock_threshold} max={1000000} onChange={set('low_stock_threshold')} />
              </Field>
            )}
            {f && (
              <Field label={t('set.lang')} hint={t('set.langHint')}>
                <div className="seg" role="radiogroup" aria-label={t('set.lang')}>
                  {LANGS.map((l) => <button key={l} type="button" role="radio" aria-checked={f.default_language === l} onClick={() => set('default_language')(l)}>{l === 'id' ? 'Bahasa Indonesia' : 'English'}</button>)}
                </div>
              </Field>
            )}
            <Field label={t('set.theme')} hint={t('set.themeHint')}>
              <div className="seg" role="radiogroup" aria-label={t('set.theme')}>
                {THEME_OPTS.map(([k, label, icon]) => (
                  <button key={k} type="button" role="radio" aria-checked={pref === k} onClick={() => setPref(k)} className="inline-flex items-center gap-1.5"><Icon name={icon} size={16} />{t(label)}</button>
                ))}
              </div>
            </Field>
          </div>
        </section>
      </div>
    </form>
  );
}
