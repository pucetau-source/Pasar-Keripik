import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { useI18n } from '../lib/i18n.jsx';

/* Custom glass dropdown replacing native <select>.
   options: [{ value, label, depth? }]  (depth indents category trees). value may be number or string; onChange(value) gets the option's own value.
   Focus stays on the trigger (aria-activedescendant); with a search box (> 8 options) focus moves to the box. */
const MAX_H = 320;
const EXIT_MS = 100;

export default function Select({ value, onChange, options, placeholder, disabled, className = '', id, searchable, ...rest }) {
  const { t } = useI18n();
  const uid = useId();
  const listId = uid + 'l';
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState(null);
  const trigRef = useRef(null), popRef = useRef(null), listRef = useRef(null), searchRef = useRef(null);
  const timer = useRef(0);
  const buf = useRef({ s: '', at: 0 });
  const sv = value == null ? '' : String(value);
  const showSearch = searchable ?? options.length > 8;
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => String(o.label).toLowerCase().includes(n)) : options;
  }, [options, q]);
  const selected = options.find((o) => String(o.value) === sv);

  const place = useCallback(() => {
    const el = trigRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const rowH = vw < 640 ? 40 : 34;
    const want = Math.min(MAX_H, shown.length * rowH + 14 + (showSearch ? 52 : 0));
    const below = vh - r.bottom - 12, above = r.top - 12;
    const flip = below < want && above > below;
    const room = Math.max(120, flip ? above : below);
    setPos({
      left: Math.max(8, Math.min(r.left, vw - r.width - 8)), minWidth: r.width, maxWidth: Math.min(380, vw - 16),
      maxHeight: Math.min(MAX_H, room), flip,
      ...(flip ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [shown.length, showSearch]);

  useLayoutEffect(() => { if (mounted) place(); }, [mounted, place]);

  useEffect(() => {
    if (!open) return;
    const reflow = (e) => { if (!popRef.current?.contains(e.target)) place(); };
    const down = (e) => {
      if (popRef.current?.contains(e.target) || trigRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', reflow, true);
    document.addEventListener('pointerdown', down, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', reflow, true); document.removeEventListener('pointerdown', down, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place]);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (open && showSearch) searchRef.current?.focus({ preventScroll: true }); }, [open, showSearch, !!pos]);
  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-hi="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, hi, pos]);

  function openPop() {
    if (disabled) return;
    clearTimeout(timer.current);
    setQ('');
    const i = options.findIndex((o) => String(o.value) === sv);
    setHi(Math.max(0, i));
    setMounted(true); setOpen(true);
    trigRef.current?.focus({ preventScroll: true });
  }
  function close(refocus) {
    setOpen(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMounted(false), EXIT_MS);
    if (refocus) trigRef.current?.focus({ preventScroll: true });
  }
  function choose(o) {
    if (!o) return;
    if (String(o.value) !== sv) onChange(o.value);
    close(true);
  }
  // Type-ahead: jump to the next option whose label starts with the typed prefix.
  function typeahead(ch, list, from) {
    const now = Date.now();
    buf.current = { s: (now - buf.current.at > 700 ? '' : buf.current.s) + ch.toLowerCase(), at: now };
    const s = buf.current.s;
    const start = s.length === 1 ? from + 1 : Math.max(from, 0);
    for (let k = 0; k < list.length; k++) {
      const i = (start + k) % list.length;
      if (String(list[i].label).trim().toLowerCase().startsWith(s)) return i;
    }
    return -1;
  }

  function onKey(e) {
    if (disabled || e.nativeEvent.isComposing) return;
    const k = e.key;
    const inSearch = e.target === searchRef.current;
    const printable = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openPop(); }
      else if (printable) {
        const cur = options.findIndex((o) => String(o.value) === sv);
        const i = typeahead(k, options, cur);
        if (i >= 0) onChange(options[i].value);
      }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (k === 'Tab') close(true);
    else if (k === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if ((k === 'Home' || k === 'End') && !inSearch) { e.preventDefault(); setHi(k === 'Home' ? 0 : Math.max(0, shown.length - 1)); }
    else if (k === 'Enter') { e.preventDefault(); choose(shown[hi]); }
    else if (k === ' ' && !inSearch) { e.preventDefault(); choose(shown[hi]); }
    else if (printable && !inSearch) { const i = typeahead(k, shown, hi); if (i >= 0) setHi(i); }
  }

  const optId = (i) => uid + 'o' + i;

  return (
    <>
      <button ref={trigRef} type="button" id={id} disabled={disabled} role="combobox" aria-haspopup="listbox"
        aria-expanded={open} aria-controls={mounted ? listId : undefined}
        aria-activedescendant={open && !showSearch && shown[hi] ? optId(hi) : undefined}
        className={'input sel-trigger ' + className}
        onClick={() => (open ? close() : openPop())} onKeyDown={onKey} {...rest}>
        <span className={'truncate min-w-0 ' + (selected ? '' : 'text-ink-mute')}>{selected ? selected.label : placeholder || ''}</span>
        <Icon name="chevD" size={16} className="sel-chev text-ink-mute" />
      </button>
      {mounted && pos && createPortal(
        <div ref={popRef} data-state={open ? 'open' : 'closed'}
          className="sel-pop glass-lg rounded-2xl fixed z-[90] flex flex-col overflow-hidden"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxWidth: pos.maxWidth, maxHeight: pos.maxHeight, width: 'max-content', '--sel-origin': pos.flip ? '50% 100%' : '50% 0' }}>
          {showSearch && (
            <div className="p-1.5 pb-0">
              <input ref={searchRef} type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
                aria-activedescendant={shown[hi] ? optId(hi) : undefined} aria-label={t('select.search')}
                className="input !min-h-[36px] !py-1 text-sm" placeholder={t('select.search')} autoComplete="off"
                value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey} />
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" aria-label={rest['aria-label']} className="sel-list scroll-thin overflow-y-auto p-1.5 m-0 list-none">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-ink-mute" role="presentation">{t('select.none')}</li>}
            {shown.map((o, i) => {
              const on = String(o.value) === sv;
              return (
                <li key={String(o.value)} id={optId(i)} role="option" aria-selected={on} data-hi={i === hi}
                  className={'sel-item flex items-center gap-2 rounded-lg pr-2 cursor-pointer select-none ' + (on ? 'text-brand-700 font-semibold' : 'text-ink')}
                  style={{ paddingLeft: 10 + (o.depth || 0) * 14 }}
                  onPointerDown={(e) => e.preventDefault()} onMouseMove={() => hi !== i && setHi(i)} onClick={() => choose(o)}>
                  <span className="flex-1 min-w-0 break-words">{o.label}</span>
                  {on && <Icon name="check" size={16} />}
                </li>
              );
            })}
          </ul>
        </div>, document.body)}
    </>
  );
}
