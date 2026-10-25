import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { ConfirmDialog, useToast } from '../ui.jsx';
import { api } from '../../lib/api.js';
import { fromApi } from '../../lib/product.js';
import { useI18n } from '../../lib/i18n.jsx';

const MAX = 9;

// images: [{id?, url, thumbUrl, file?(File for staged)}]. For saved products changes hit the API right away.
export default function Photos({ productId, images, onChange, error }) {
  const { t } = useI18n();
  const toast = useToast();
  const input = useRef(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  useEffect(() => () => images.forEach((i) => i.blob && URL.revokeObjectURL(i.url)), []); // eslint-disable-line

  async function add(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/')).slice(0, MAX - images.length);
    if (!files.length) return;
    if (!productId) {
      onChange([...images, ...files.map((f) => ({ blob: f, url: URL.createObjectURL(f), thumbUrl: URL.createObjectURL(f), tmp: true }))]);
      return;
    }
    setBusy(true);
    try {
      await api.uploadImages(productId, files);
      const d = await api.product(productId);
      onChange(fromApi(d).images);
      toast(t('photos.uploaded'));
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  async function reorder(from, to) {
    if (from === to || to < 0 || to >= images.length) return;
    const before = images;
    const next = [...images];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    const withCover = next.map((x, i) => ({ ...x, is_cover: i === 0 }));
    onChange(withCover);
    if (productId) {
      try { await api.orderImages(productId, next.map((x) => x.id)); } catch (e) { onChange(before); toast(e.message, 'err'); }
    }
  }

  async function remove() {
    const img = del;
    if (!img.id) { onChange(images.filter((x) => x !== img)); setDel(null); return; }
    const before = images;
    onChange(images.filter((x) => x !== img).map((x, i) => ({ ...x, is_cover: i === 0 })));
    setDel(null);
    try { await api.deleteImage(img.id); toast(t('photos.removed')); } catch (e) { onChange(before); toast(e.message, 'err'); }
  }

  return (
    <div>
      <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2.5">
        {images.map((im, i) => (
          <li key={im.id || im.url} draggable onDragStart={() => setDrag(i)} onDragEnd={() => { setDrag(null); setOver(null); }}
            onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDrop={(e) => { e.preventDefault(); if (drag != null) reorder(drag, i); setDrag(null); setOver(null); }}
            className={'relative group rounded-xl overflow-hidden bg-surface border-2 aspect-square cursor-grab active:cursor-grabbing ' + (over === i && drag != null ? 'border-brand-600' : 'border-[var(--line)]') + (drag === i ? ' opacity-40' : '')}>
            <img src={im.thumbUrl || im.url} alt={`${t('photos.photo')} ${i + 1}`} className="w-full h-full object-cover" draggable="false" width="160" height="160" />
            {i === 0 && <span className="absolute top-1.5 left-1.5 chip bg-brand-600 text-white shadow"><Icon name="star" size={12} />{t('photos.cover')}</span>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 p-1 bg-gradient-to-t from-black/70 to-transparent text-white">
              <span className="flex">
                <button type="button" className="p-1.5 rounded hover:bg-white/25 disabled:opacity-30" disabled={i === 0} aria-label={t('photos.left')} onClick={() => reorder(i, i - 1)}><Icon name="chevL" size={16} /></button>
                <button type="button" className="p-1.5 rounded hover:bg-white/25 disabled:opacity-30" disabled={i === images.length - 1} aria-label={t('photos.right')} onClick={() => reorder(i, i + 1)}><Icon name="chevR" size={16} /></button>
              </span>
              <span className="flex">
                {i !== 0 && <button type="button" className="p-1.5 rounded hover:bg-white/25" aria-label={t('photos.makeCover')} title={t('photos.makeCover')} onClick={() => reorder(i, 0)}><Icon name="star" size={16} /></button>}
                <button type="button" className="p-1.5 rounded hover:bg-white/25" aria-label={t('common.delete')} onClick={() => (im.id ? setDel(im) : setDel(im))}><Icon name="trash" size={16} /></button>
              </span>
            </div>
          </li>
        ))}
        {images.length < MAX && (
          <li>
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) add(e.dataTransfer.files); }}
              className="w-full aspect-square rounded-xl border-2 border-dashed border-ink-mute/60 bg-sunken hover:bg-sunken hover:border-brand-600 flex flex-col items-center justify-center gap-1 text-ink-soft font-semibold text-sm text-center px-1">
              <Icon name="upload" size={26} />
              {busy ? t('common.wait') : t('photos.add')}
              <span className="text-xs font-normal text-ink-mute">{images.length}/{MAX}</span>
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
      <p className="field-hint">{t('photos.hint')}</p>
      {error && <p className="field-error" role="alert"><Icon name="alert" size={14} className="mt-0.5" />{error}</p>}
      {del && <ConfirmDialog title={t('photos.deleteTitle')} message={t('photos.deleteMsg')} onConfirm={remove} onClose={() => setDel(null)} />}
    </div>
  );
}
