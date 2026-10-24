import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Empty, ErrorBox, PageHeader, Skel, useAsync } from '../components/ui.jsx';
import { api, asList } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { fmtWib } from '../lib/format.js';
import { auditText, buildGroups } from '../lib/audit.js';
import { ensureTree, flatten } from '../lib/tree.js';

const PAGE = 100;
const TONE = { created: 'bg-leaf-100 text-leaf-700', deleted: 'bg-chili-100 text-chili-700' };
const lineOf = (c) => c.text || (c.label ? `${c.label}: ${c.from ?? '-'} \u2192 ${c.to ?? '-'}` : '');

// One card per save: who, when (WIB), summary and a collapsible list of plain-language changes.
function Card({ g, open0 }) {
  const { lang } = useI18n();
  const T = auditText(lang);
  const [open, setOpen] = useState(open0);
  const tone = TONE[g.kind] || 'bg-cream-200 text-ink-soft';
  return (
    <li className="glass rounded-xl p-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className={'chip ' + tone}>{g.summary}</span>
        <span className="text-sm text-ink-soft ml-auto text-right">
          <span className="block sm:inline">{g.atText}</span><span className="hidden sm:inline"> · </span><span className="block sm:inline">{T.by} {g.user}</span>
        </span>
      </div>
      {g.lines.length > 0 && (
        <>
          <button type="button" className="btn-ghost -ml-2 mt-2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'chevD' : 'chevR'} size={16} />{open ? T.hide : T.show} ({g.lines.length})
          </button>
          {open && <ul className="mt-1 space-y-1.5 text-sm list-disc pl-5 marker:text-ink-mute">{g.lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ul>}
        </>
      )}
    </li>
  );
}

export default function Audit() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const [extra, setExtra] = useState([]);
  const [more, setMore] = useState(false);
  const res = useAsync(() => Promise.all([
    api.audit(id, { page: 1, page_size: PAGE }),
    api.product(id).catch(() => null),
    api.categories().catch(() => []),
    api.units().catch(() => []),
    api.settings().catch(() => null),
  ]), [id, lang]);
  useEffect(() => { setExtra([]); }, [id, lang]);

  const first = res.data?.[0];
  const raw = useMemo(() => [...asList(first), ...extra], [first, extra]);
  const total = first?.total ?? raw.length;
  const name = res.data?.[1]?.name;

  const groups = useMemo(() => {
    if (!res.data) return [];
    const serverGrouped = raw.length > 0 && raw.every((e) => e.summary !== undefined && Array.isArray(e.changes));
    if (serverGrouped) {
      return raw.map((e) => ({
        key: e.id, kind: e.action, summary: e.summary, user: e.user?.name || e.user?.userid || auditText(lang).unknownUser,
        atText: e.at_text || fmtWib(e.at, lang), lines: e.changes.map(lineOf).filter(Boolean),
      }));
    }
    // Older API: group raw rows by save (txn, or same user + second) in the browser.
    const product = res.data[1];
    const variants = new Map((product?.variants || []).map((v) => [v.id, { label: (v.option_values || []).join(' / '), sku: v.sku }]));
    const categories = new Map(flatten(ensureTree(res.data[2]?.categories || res.data[2])).map((c) => [c.id, c.pathLabel]));
    const units = new Map(asList(res.data[3]).map((u) => [u.id, u.symbol]));
    const reasons = res.data[4]?.stock_reason_labels;
    return buildGroups(raw, { lang, variants, categories, units, reasons }).map((g) => ({ ...g, lines: g.lines.map((l) => l.text), kind: g.created ? 'created' : g.deleted ? 'deleted' : 'updated', atText: fmtWib(g.at, lang) }));
  }, [res.data, raw, lang]);

  async function loadMore() {
    setMore(true);
    try {
      const next = Math.floor(raw.length / PAGE) + 1;
      const d = await api.audit(id, { page: next, page_size: PAGE });
      setExtra((x) => [...x, ...asList(d)]);
    } catch { /* keep what we have */ } finally { setMore(false); }
  }

  return (
    <div>
      <PageHeader title={t('audit.title')} subtitle={name}
        back={<Link to={`/products/${id}`} className="btn-ghost -ml-2"><Icon name="chevL" size={18} />{t('audit.back')}</Link>} />
      {res.loading && !res.data && <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-20" />)}</div>}
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.data && groups.length === 0 && <div className="glass rounded-xl"><Empty icon="history" title={t('audit.empty')} text={t('audit.emptyText')} /></div>}
      {groups.length > 0 && <ul className="grid gap-3 lg:grid-cols-2 items-start">{groups.map((g) => <Card key={g.key} g={g} open0={g.lines.length <= 4} />)}</ul>}
      {raw.length < total && <button className="btn-soft mt-3" disabled={more} onClick={loadMore}>{more ? t('common.wait') : t('audit.more')}</button>}
    </div>
  );
}
