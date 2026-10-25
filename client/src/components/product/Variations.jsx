import { useState } from 'react';
import Select from '../Select.jsx';
import Icon from '../Icon.jsx';
import { DecInput, Field, Money, NumInput, TextInput, Toggle } from '../ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { syncVariants, uid, variantLabel } from '../../lib/product.js';

const MAX_AXES = 3;

function AxesEditor({ axes, setAxes, err }) {
  const { t } = useI18n();
  const upd = (i, patch) => setAxes(axes.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  const addAxis = () => setAxes([...axes, { uid: uid('a'), name: '', options: [{ uid: uid('o'), value: '' }] }]);
  return (
    <div className="space-y-3">
      {axes.map((a, i) => (
        <div key={a.uid} className="panel p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <Field className="flex-1" label={t('var.axisName', { n: i + 1 })} error={err(`axes.${i}.name`)} htmlFor={`ax${i}`}>
              <TextInput id={`ax${i}`} value={a.name} error={err(`axes.${i}.name`)} onChange={(e) => upd(i, { name: e.target.value })} placeholder={t('var.axisPh' + (i % 3))} maxLength={40} />
            </Field>
            <button type="button" className="btn-icon hover:!text-danger-700 mb-0.5" aria-label={t('var.removeAxis')} title={t('var.removeAxis')} onClick={() => setAxes(axes.filter((_, k) => k !== i))}><Icon name="trash" /></button>
          </div>
          <p className="field-label mt-3">{t('var.options')}</p>
          <div className="flex flex-wrap gap-2">
            {a.options.map((o, j) => (
              <div key={o.uid} className="flex items-center">
                <input className="input !w-36 !rounded-r-none" aria-label={`${a.name || t('var.axisName', { n: i + 1 })} ${j + 1}`} aria-invalid={err(`axes.${i}.options.${j}`) ? 'true' : undefined}
                  value={o.value} maxLength={40} placeholder={t('var.optionPh' + (i % 3))}
                  onChange={(e) => upd(i, { options: a.options.map((x) => (x.uid === o.uid ? { ...x, value: e.target.value } : x)) })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); upd(i, { options: [...a.options, { uid: uid('o'), value: '' }] }); } }} />
                <button type="button" className="btn-soft !rounded-l-none !px-2 border-l-0" aria-label={t('common.delete')} onClick={() => upd(i, { options: a.options.filter((x) => x.uid !== o.uid) })}><Icon name="x" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn-soft" onClick={() => upd(i, { options: [...a.options, { uid: uid('o'), value: '' }] })}><Icon name="plus" size={16} />{t('var.addOption')}</button>
          </div>
          {err(`axes.${i}.options`) && <p className="field-error" role="alert">{err(`axes.${i}.options`)}</p>}
        </div>
      ))}
      {err('axes') && <p className="field-error" role="alert">{err('axes')}</p>}
      {axes.length < MAX_AXES && (
        <button type="button" className="btn-soft" onClick={addAxis}><Icon name="plus" size={16} />{axes.length ? t('var.addAxis2') : t('var.addAxis')}</button>
      )}
      {axes.length === 0 && <p className="field-hint">{t('var.noAxisHint')}</p>}
    </div>
  );
}

function UnitSelect({ value, onChange, units, id, error }) {
  const { t } = useI18n();
  return (
    <Select id={id} className="!w-28 shrink-0 !rounded-l-none" aria-label={t('var.unit')} aria-invalid={error ? 'true' : undefined} value={value ?? ''} onChange={(x) => onChange(x === '' ? '' : Number(x))}
      options={[{ value: '', label: t('var.unitPick') }, ...units.map((u) => ({ value: u.id, label: u.symbol }))]} />
  );
}

function VariantCard({ v, i, axes, units, set, err, isNew, onStock, showLabel }) {
  const { t } = useI18n();
  const e = (f) => err(`variants.${i}.${f}`);
  const fresh = !v.id;
  const label = variantLabel(v, axes);
  return (
    <div className="panel p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-bold break-words min-w-0">{showLabel ? label : t('var.single')}</h3>
        {showLabel && <Toggle checked={v.active} onChange={(x) => set(i, { active: x })} label={t('var.active')} />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Field label="SKU" error={e('sku')} htmlFor={`sku${i}`}><TextInput id={`sku${i}`} value={v.sku} error={e('sku')} onChange={(x) => set(i, { sku: x.target.value })} maxLength={60} /></Field>
        <Field label={t('var.barcode')} error={e('barcode')} htmlFor={`bc${i}`}><TextInput id={`bc${i}`} value={v.barcode} error={e('barcode')} inputMode="numeric" onChange={(x) => set(i, { barcode: x.target.value })} maxLength={40} /></Field>
        <Field label={t('var.price')} error={e('price')} required htmlFor={`pr${i}`}><Money id={`pr${i}`} value={v.price} error={e('price')} onChange={(x) => set(i, { price: x })} /></Field>
        <Field className={fresh ? '' : 'col-span-2 sm:col-span-1'} label={t('var.stock')} error={e('stock')} htmlFor={`st${i}`} hint={fresh ? t('var.stockNewHint') : undefined}>
          {fresh ? <NumInput id={`st${i}`} value={v.stock} error={e('stock')} onChange={(x) => set(i, { stock: x })} />
            : (
              <div className="flex gap-2">
                <input id={`st${i}`} className="input tabnum min-w-0" readOnly value={v.stock} aria-label={t('var.stock')} />
                <button type="button" className="btn-soft shrink-0" onClick={() => onStock(v)} disabled={!v.id}>{t('var.adjust')}</button>
              </div>
            )}
        </Field>
        <Field className="col-span-2 lg:col-span-1" required label={t('var.weight')} error={e('weight_value') || e('weight_unit_id')} htmlFor={`wv${i}`}>
          <div className="flex">
            <DecInput id={`wv${i}`} value={v.weight_value} error={e('weight_value')} onChange={(x) => set(i, { weight_value: x })} className="!rounded-r-none" />
            <UnitSelect id={`wu${i}`} units={units} value={v.weight_unit_id} onChange={(x) => set(i, { weight_unit_id: x })} error={e('weight_unit_id')} />
          </div>
        </Field>
      </div>
    </div>
  );
}

export default function Variations({ form, setForm, units, err, isNew, onStock }) {
  const { t } = useI18n();
  const [bulk, setBulk] = useState({ price: '', weight_value: '', weight_unit_id: '' });
  const setAxes = (axes) => setForm((f) => ({ ...f, axes, variants: syncVariants(axes, f.variants) }));
  const setVariant = (i, patch) => setForm((f) => ({ ...f, variants: f.variants.map((v, k) => (k === i ? { ...v, ...patch } : v)) }));
  const multi = form.variants.length > 1 || form.variants[0]?.combo.length > 0;

  const applyAll = () => setForm((f) => ({
    ...f,
    variants: f.variants.map((v) => ({
      ...v,
      ...(bulk.price !== '' ? { price: bulk.price } : {}),
      ...(bulk.weight_value !== '' ? { weight_value: bulk.weight_value } : {}),
      ...(bulk.weight_unit_id !== '' ? { weight_unit_id: bulk.weight_unit_id } : {}),
    })),
  }));

  return (
    <div className="space-y-4">
      <AxesEditor axes={form.axes} setAxes={setAxes} err={err} />
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="text-lg font-bold mb-1">{multi ? t('var.tableTitle', { n: form.variants.length }) : t('var.singleTitle')}</h3>
        {multi && <p className="text-sm text-ink-soft mb-3">{t('var.tableHint')}</p>}
        {multi && form.variants.length > 1 && (
          <div className="panel p-3 mb-3 grid grid-cols-2 lg:grid-cols-[1fr_1.3fr_auto] gap-3 items-end">
            <Field className="col-span-2 lg:col-span-1" label={t('var.bulkPrice')}><Money value={bulk.price} onChange={(x) => setBulk({ ...bulk, price: x })} aria-label={t('var.bulkPrice')} /></Field>
            <Field className="col-span-2 lg:col-span-1" label={t('var.bulkWeight')}>
              <div className="flex"><DecInput value={bulk.weight_value} onChange={(x) => setBulk({ ...bulk, weight_value: x })} className="!rounded-r-none min-w-0" aria-label={t('var.bulkWeight')} /><UnitSelect units={units} value={bulk.weight_unit_id} onChange={(x) => setBulk({ ...bulk, weight_unit_id: x })} /></div>
            </Field>
            <button type="button" className="btn-soft col-span-2 lg:col-span-1" onClick={applyAll} disabled={bulk.price === '' && bulk.weight_value === '' && bulk.weight_unit_id === ''}>{t('var.applyAll')}</button>
          </div>
        )}
        <div className="space-y-3">
          {form.variants.map((v, i) => <VariantCard key={v.key || 'single'} v={v} i={i} axes={form.axes} units={units} set={setVariant} err={err} isNew={isNew} onStock={onStock} showLabel={multi} />)}
        </div>
        {err('variants') && <p className="field-error" role="alert">{err('variants')}</p>}
      </div>
    </div>
  );
}
