import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { digits, int } from '../lib/format.js';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, kind }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[80] left-3 right-3 bottom-4 md:left-auto md:right-6 md:w-96 flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className={'anim-pop pointer-events-auto rounded-xl px-3.5 py-2.5 text-sm font-medium shadow-lg flex items-start gap-2 text-white ' + (x.kind === 'err' ? 'bg-red-700' : 'bg-green-700')}>
            <Icon name={x.kind === 'err' ? 'alert' : 'check'} size={18} className="mt-0.5" />
            <span>{x.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, wide }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const tid = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    (ref.current?.querySelector('input,select,textarea') || ref.current?.querySelector('button'))?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 anim-fade" style={{ background: 'var(--backdrop)' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tid}
        className={'glass-lg anim-pop w-full ' + (wide ? 'sm:max-w-3xl' : 'sm:max-w-lg') + ' max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl'}>
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5 border-b border-[var(--line)]">
          <h2 id={tid} className="text-lg font-bold">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button>
        </div>
        <div className="px-4 py-3 overflow-y-auto">{children}</div>
        {footer && <div className="px-4 py-2.5 border-t border-[var(--line)] flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose, busy }) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn-soft" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-danger" disabled={busy} onClick={onConfirm}>{busy ? t('common.wait') : confirmLabel || t('common.delete')}</button>
      </>}>
      <p className="text-ink-soft">{message}</p>
    </Modal>
  );
}

/* ---------- Form bits ---------- */
export function Field({ label, hint, error, required, children, className = '', htmlFor }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="field-label">{label}{required && <span className="text-danger-600" aria-hidden="true"> *</span>}</label>}
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert"><Icon name="alert" size={14} className="mt-0.5" />{error}</p>}
    </div>
  );
}

export function TextInput({ error, className = '', ...p }) {
  return <input className={'input ' + className} aria-invalid={error ? 'true' : undefined} {...p} />;
}

// Whole-number input shown with id-ID thousand separators. value: number | ''
export function NumInput({ value, onChange, error, max = 2147483647, className = '', ...p }) {
  return (
    <input inputMode="numeric" autoComplete="off" className={'input tabnum ' + className} aria-invalid={error ? 'true' : undefined}
      value={value === '' || value == null ? '' : int(value)}
      onChange={(e) => { const d = digits(e.target.value); onChange(d === '' ? '' : Math.min(Number(d), max)); }} {...p} />
  );
}

// Decimal input (weight, cm). value: string
export function DecInput({ value, onChange, error, className = '', ...p }) {
  return (
    <input inputMode="decimal" autoComplete="off" className={'input tabnum ' + className} aria-invalid={error ? 'true' : undefined}
      value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))} {...p} />
  );
}

export function Money({ value, onChange, error, className = '', ...p }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute text-sm pointer-events-none">Rp</span>
      <NumInput value={value} onChange={onChange} error={error} className={'pl-9 ' + className} {...p} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <input id={id} type="checkbox" role="switch" className="sr-only peer" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative w-11 h-6 rounded-full bg-ink-mute/40 peer-checked:bg-blue-600 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)] peer-focus-visible:outline-offset-2 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform after:shadow peer-checked:after:translate-x-5" />
      {label && <span className="font-medium">{label}</span>}
    </label>
  );
}

/* ---------- Misc ---------- */
export function Skel({ className = '' }) { return <div className={'skel ' + className} aria-hidden="true" />; }

export function Empty({ icon = 'box', title, text, action }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center bg-brand-100 text-brand-600 mb-3"><Icon name={icon} size={28} /></div>
      <h3 className="text-base font-bold mb-1">{title}</h3>
      {text && <p className="text-ink-soft max-w-sm mx-auto mb-4">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="panel p-5 text-center" role="alert">
      <Icon name="alert" size={28} className="mx-auto text-danger-600 mb-2" />
      <p className="font-semibold">{error?.message || t('common.error')}</p>
      {onRetry && <button className="btn-soft mt-3" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  );
}

export function SectionCard({ id, title, hint, children, aside }) {
  return (
    <section id={id} className="glass rounded-2xl p-4 scroll-mt-24">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {hint && <p className="text-sm text-ink-soft mt-0.5">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Pagination({ page, pages, total, onPage }) {
  const { t } = useI18n();
  if (pages <= 1) return <p className="text-sm text-ink-soft px-1">{t('list.total', { n: int(total) })}</p>;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-ink-soft">{t('list.total', { n: int(total) })}</p>
      <div className="flex items-center gap-2">
        <button className="btn-soft" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevL" size={16} />{t('common.prev')}</button>
        <span className="text-sm font-semibold tabnum px-1">{page} / {pages}</span>
        <button className="btn-soft" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('common.next')}<Icon name="chevR" size={16} /></button>
      </div>
    </div>
  );
}

// Small data hook with abort + reload
export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fn(ac.signal).then((data) => !ac.signal.aborted && setState({ loading: false, data, error: null }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ loading: false, data: null, error }); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload, setData };
}

// The page title lives in the shell topbar (one per page). Here: back link, a short lead line and the page actions.
export function PageHeader({ subtitle, children, back }) {
  if (!subtitle && !children && !back) return null;
  return (
    <div className="mb-4">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {subtitle ? <p className="text-sm font-medium text-ink-soft min-w-0 flex-1 basis-60">{subtitle}</p> : <span />}
        {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
      </div>
    </div>
  );
}
