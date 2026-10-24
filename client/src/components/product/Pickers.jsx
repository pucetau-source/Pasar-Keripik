import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { api, asList } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { findNode, flatten } from '../../lib/tree.js';

/* ---------- Category tree picker ---------- */
function TreeNode({ n, depth, value, onPick, open, toggle, forceOpen }) {
  const kids = n.children || [];
  const isOpen = forceOpen || open.has(n.id);
  return (
    <li role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={value === n.id}>
      <div className={'flex items-center rounded-lg ' + (value === n.id ? 'bg-brand-100' : 'hover:bg-sunken')} style={{ paddingLeft: depth * 18 }}>
        {kids.length ? (
          <button type="button" className="p-2 text-ink-soft" aria-label={isOpen ? 'collapse' : 'expand'} onClick={() => toggle(n.id)}><Icon name={isOpen ? 'chevD' : 'chevR'} size={16} /></button>
        ) : <span className="w-8" />}
        <button type="button" className="flex-1 text-left py-2 pr-3 font-medium flex items-center gap-2" onClick={() => onPick(n)}>
          {n.name}{value === n.id && <Icon name="check" size={16} className="text-brand-700" />}
        </button>
      </div>
      {kids.length > 0 && isOpen && <ul role="group">{kids.map((c) => <TreeNode key={c.id} n={c} depth={depth + 1} value={value} onPick={onPick} open={open} toggle={toggle} forceOpen={forceOpen} />)}</ul>}
    </li>
  );
}

function filterTree(tree, q) {
  const s = q.trim().toLowerCase();
  if (!s) return tree;
  const walk = (list) => list.map((n) => {
    const kids = walk(n.children || []);
    return n.name.toLowerCase().includes(s) || kids.length ? { ...n, children: kids } : null;
  }).filter(Boolean);
  return walk(tree);
}

export function CategoryPicker({ tree, value, onChange, error, id }) {
  const { t } = useI18n();
  const [openPanel, setOpenPanel] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(new Set());
  const ref = useRef(null);
  const flat = useMemo(() => flatten(tree), [tree]);
  const sel = flat.find((c) => c.id === value);
  const shown = useMemo(() => filterTree(tree, q), [tree, q]);

  useEffect(() => {
    if (!openPanel) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpenPanel(false); };
    const onKey = (e) => e.key === 'Escape' && setOpenPanel(false);
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [openPanel]);

  // expand ancestors of the selected node when opening
  useEffect(() => {
    if (!openPanel || !sel) return;
    const s = new Set(open);
    let cur = findNode(tree, sel.parent_id);
    while (cur) { s.add(cur.id); cur = findNode(tree, cur.parent_id); }
    setOpen(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPanel]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" id={id} className="input text-left flex items-center justify-between gap-2" aria-haspopup="tree" aria-expanded={openPanel} aria-invalid={error ? 'true' : undefined} onClick={() => setOpenPanel((o) => !o)}>
        <span className={'truncate ' + (sel ? '' : 'text-ink-mute')}>{sel ? sel.pathLabel : t('form.categoryPick')}</span>
        <Icon name="chevD" size={18} className="text-ink-soft" />
      </button>
      {openPanel && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-[var(--line)] shadow-xl p-2 anim-pop" style={{ background: "var(--pop)" }}>
          <div className="relative mb-2">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input className="input pl-9" placeholder={t('form.categorySearch')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <ul role="tree" className="max-h-64 overflow-y-auto scroll-thin">
            {shown.length === 0 && <li className="text-sm text-ink-soft p-3">{tree.length ? t('form.categoryNone') : t('form.categoryEmpty')}</li>}
            {shown.map((n) => (
              <TreeNode key={n.id} n={n} depth={0} value={value} open={open} forceOpen={!!q.trim()}
                toggle={(i) => setOpen((s) => { const x = new Set(s); x.has(i) ? x.delete(i) : x.add(i); return x; })}
                onPick={(c) => { onChange(c.id); setOpenPanel(false); setQ(''); }} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Tags ---------- */
export function TagsInput({ tags, onChange, id }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [sugg, setSugg] = useState([]);
  const lid = useId();

  useEffect(() => {
    const s = text.trim();
    if (s.length < 1) { setSugg([]); return; }
    const ac = new AbortController();
    const h = setTimeout(() => {
      api.tags(s, ac.signal).then((d) => setSugg(asList(d).map((x) => (typeof x === 'string' ? x : x.tag)).filter((x) => !tags.includes(x)).slice(0, 8))).catch(() => {});
    }, 200);
    return () => { clearTimeout(h); ac.abort(); };
  }, [text, tags]);

  const add = (v) => {
    const x = v.trim().replace(/\s+/g, ' ');
    if (x && !tags.some((y) => y.toLowerCase() === x.toLowerCase())) onChange([...tags, x]);
    setText('');
  };

  return (
    <div>
      <div className="input flex flex-wrap items-center gap-1.5 !py-1.5 focus-within:border-[var(--focus)] focus-within:shadow-[0_0_0_3px_var(--focus-ring)]">
        {tags.map((x) => (
          <span key={x} className="chip bg-brand-100 text-ink !text-sm !py-1">
            {x}
            <button type="button" className="p-0.5 rounded-full hover:bg-black/10" aria-label={`${t('common.delete')} ${x}`} onClick={() => onChange(tags.filter((y) => y !== x))}><Icon name="x" size={14} /></button>
          </span>
        ))}
        <input id={id} list={lid} className="flex-1 min-w-[8rem] bg-transparent outline-none py-1" value={text} placeholder={tags.length ? '' : t('form.tagsPh')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); }
            else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)} maxLength={40} />
        <datalist id={lid}>{sugg.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <p className="field-hint">{t('form.tagsHint')}</p>
    </div>
  );
}
