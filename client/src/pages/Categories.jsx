import { useMemo, useState } from 'react';
import Select from '../components/Select.jsx';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog, Empty, ErrorBox, Field, Modal, PageHeader, Skel, TextInput, useAsync, useToast } from '../components/ui.jsx';
import { api, ApiError, normFields } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { descendantIds, ensureTree, findNode, flatten } from '../lib/tree.js';

function CategoryDialog({ tree, node, parentId, onClose, onSaved }) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(node?.name || '');
  const [parent, setParent] = useState(node ? node.parent_id ?? '' : parentId ?? '');
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const blocked = node ? descendantIds(findNode(tree, node.id) || node) : new Set();
  const options = flatten(tree).filter((c) => !blocked.has(c.id));

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setErr({ name: t('v.required') });
    setBusy(true); setErr({});
    const body = { name: name.trim(), parent_id: parent === '' ? null : Number(parent) };
    try {
      if (node) await api.updateCategory(node.id, body); else await api.createCategory(body);
      toast(t('cat.saved'));
      onSaved();
    } catch (e2) {
      const f = e2 instanceof ApiError ? normFields(e2.fields) : {};
      setErr({ name: f.name, parent_id: f.parent_id, _: e2.message });
    } finally { setBusy(false); }
  }

  return (
    <Modal title={node ? t('cat.edit') : t('cat.add')} onClose={onClose}
      footer={<><button className="btn-soft" onClick={onClose}>{t('common.cancel')}</button><button form="catform" className="btn-primary" disabled={busy}>{busy ? t('common.wait') : t('common.save')}</button></>}>
      <form id="catform" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('cat.name')} error={err.name} required htmlFor="cn"><TextInput id="cn" value={name} error={err.name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Field label={t('cat.parent')} hint={t('cat.parentHint')} error={err.parent_id} htmlFor="cp">
          <Select id="cp" value={parent} onChange={(x) => setParent(String(x))}
            options={[{ value: '', label: t('cat.root') }, ...options.map((c) => ({ value: c.id, label: c.name, depth: c.depth }))]} />
        </Field>
        {err._ && !err.name && !err.parent_id && <p className="field-error" role="alert">{err._}</p>}
      </form>
    </Modal>
  );
}

function Row({ n, depth, siblings, idx, onAdd, onEdit, onDelete, onMove }) {
  const { t } = useI18n();
  return (
    <li>
      <div className="flex items-center gap-1 py-0.5 pr-1 rounded-lg hover:bg-[var(--row-hover)]" style={{ paddingLeft: depth * 20 + 6 }}>
        <Icon name={n.children?.length ? 'folder' : 'tag'} size={18} className="text-brand-600" />
        <span className="font-semibold flex-1 min-w-0 break-words pl-1">{n.name}
          {n.product_count != null && <span className="chip bg-mist-200 text-ink-soft ml-2">{t('cat.products', { n: n.product_count })}</span>}
        </span>
        <span className="flex items-center shrink-0">
          <button className="btn-icon !w-8 !h-8" disabled={idx === 0} aria-label={t('cat.up')} title={t('cat.up')} onClick={() => onMove(n, -1)}><Icon name="up" size={18} /></button>
          <button className="btn-icon !w-8 !h-8" disabled={idx === siblings.length - 1} aria-label={t('cat.down')} title={t('cat.down')} onClick={() => onMove(n, 1)}><Icon name="chevD" size={18} /></button>
          <button className="btn-icon !w-8 !h-8" aria-label={t('cat.addChild')} title={t('cat.addChild')} onClick={() => onAdd(n.id)}><Icon name="plus" size={18} /></button>
          <button className="btn-icon !w-8 !h-8" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => onEdit(n)}><Icon name="edit" size={18} /></button>
          <button className="btn-icon !w-8 !h-8 hover:!text-danger-700" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => onDelete(n)}><Icon name="trash" size={18} /></button>
        </span>
      </div>
      {n.children?.length > 0 && (
        <ul>{n.children.map((c, i) => <Row key={c.id} n={c} depth={depth + 1} siblings={n.children} idx={i} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onMove={onMove} />)}</ul>
      )}
    </li>
  );
}

export default function Categories() {
  const { t } = useI18n();
  const toast = useToast();
  const res = useAsync(() => api.categories().then((d) => ensureTree(d?.categories || d)), []);
  const tree = useMemo(() => res.data || [], [res.data]);
  const [dlg, setDlg] = useState(null); // {node?, parentId?}
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

  async function move(n, dir) {
    const sibs = n.parent_id == null ? tree : findNode(tree, n.parent_id)?.children || [];
    const i = sibs.findIndex((x) => x.id === n.id);
    const j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    const before = res.data;
    // optimistic reorder in a cloned tree
    const clone = (list) => list.map((x) => ({ ...x, children: clone(x.children || []) }));
    const t2 = clone(tree);
    const arr = n.parent_id == null ? t2 : findNode(t2, n.parent_id).children;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    res.setData(t2);
    try {
      await api.updateCategory(n.id, { name: n.name, parent_id: n.parent_id ?? null, position: j });
      res.reload();
    } catch (e) { res.setData(before); toast(e.message, 'err'); }
  }

  async function doDelete() {
    setBusy(true); setDelErr('');
    try { await api.deleteCategory(del.id); toast(t('cat.deleted')); setDel(null); res.reload(); }
    catch (e) { setDelErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader subtitle={t('cat.intro')}>
        <button className="btn-primary" onClick={() => setDlg({})}><Icon name="plus" />{t('cat.add')}</button>
      </PageHeader>

      {res.loading && !res.data && <div className="glass rounded-2xl p-3 space-y-2">{Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-9" />)}</div>}
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.data && tree.length === 0 && <div className="glass rounded-2xl"><Empty icon="tree" title={t('cat.empty')} text={t('cat.emptyText')} action={<button className="btn-primary" onClick={() => setDlg({})}><Icon name="plus" />{t('cat.add')}</button>} /></div>}
      {/* One card per top-level category, flowing into columns so wide screens stay filled */}
      {tree.length > 0 && (
        <div className="columns-1 md:columns-2 2xl:columns-3 gap-4">
          {tree.map((n, i) => (
            <ul key={n.id} className="glass rounded-2xl p-2 mb-4 break-inside-avoid">
              <Row n={n} depth={0} siblings={tree} idx={i} onAdd={(pid) => setDlg({ parentId: pid })} onEdit={(x) => setDlg({ node: x })} onDelete={(x) => { setDelErr(''); setDel(x); }} onMove={move} />
            </ul>
          ))}
        </div>
      )}

      {dlg && <CategoryDialog tree={tree} node={dlg.node} parentId={dlg.parentId} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); res.reload(); }} />}
      {del && (
        <ConfirmDialog title={t('cat.deleteTitle')} busy={busy} onClose={() => setDel(null)} onConfirm={doDelete}
          message={<>{t('cat.deleteMsg', { name: del.name })}{delErr && <span className="field-error mt-3" role="alert"><Icon name="alert" size={14} className="mt-0.5" />{delErr}</span>}</>} />
      )}
    </div>
  );
}
