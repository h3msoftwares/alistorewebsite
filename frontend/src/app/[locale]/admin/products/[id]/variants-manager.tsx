'use client';

import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Alert, Field, Icon, Input } from '@/components/ui';
import { useAddProductVariant, useDeleteProductVariant, useUpdateProductVariant } from '@/hooks/use-catalog';
import type { ProductVariant } from '@/lib/types';

type RowValues = { sku: string; size: string; color: string; priceOverride: string; stockQuantity: string };

function toRowValues(v: ProductVariant): RowValues {
  return {
    sku: v.sku,
    size: v.size ?? '',
    color: v.color ?? '',
    priceOverride: v.price != null ? String(v.price) : '',
    stockQuantity: String(v.stockQuantity),
  };
}

const PRICE_RE = /^$|^\d+(\.\d{1,2})?$/;

function validate(values: RowValues, t: (en: string, ar: string) => string) {
  const errors: Partial<Record<keyof RowValues, string>> = {};
  if (!values.sku.trim()) errors.sku = t('Required', 'مطلوب');
  if (!PRICE_RE.test(values.priceOverride)) {
    errors.priceOverride = t('Must be empty or a positive number', 'يجب أن يكون فارغًا أو رقمًا موجبًا');
  }
  const qty = Number(values.stockQuantity);
  if (!Number.isFinite(qty) || !Number.isInteger(qty)) {
    errors.stockQuantity = t('Must be a whole number', 'يجب أن يكون رقمًا صحيحًا');
  }
  return errors;
}

/** One variant's editable row — used both for existing variants (Save +
 *  Delete, calling the update/delete sub-resource mutations) and for the
 *  "add a variant" row at the bottom (Add only, no delete). */
function VariantRow({
  values,
  onChange,
  errors,
  locale,
  busy,
  onSave,
  onDelete,
  saveLabel,
  deleteDisabled,
}: {
  values: RowValues;
  onChange: (values: RowValues) => void;
  errors: Partial<Record<keyof RowValues, string>>;
  locale: 'en' | 'ar';
  busy: boolean;
  onSave: () => void;
  onDelete?: () => void;
  saveLabel: string;
  deleteDisabled?: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  return (
    <div className="admin-variant-row">
      <Field label={t('SKU', 'رمز')} error={errors.sku} required>
        {(p) => <Input {...p} value={values.sku} onChange={(e) => onChange({ ...values, sku: e.target.value })} disabled={busy} />}
      </Field>
      <Field label={t('Size', 'المقاس')}>
        {(p) => <Input {...p} value={values.size} onChange={(e) => onChange({ ...values, size: e.target.value })} disabled={busy} />}
      </Field>
      <Field label={t('Colour', 'اللون')}>
        {(p) => <Input {...p} value={values.color} onChange={(e) => onChange({ ...values, color: e.target.value })} disabled={busy} />}
      </Field>
      <Field label={t('Price override', 'سعر خاص')} error={errors.priceOverride}>
        {(p) => (
          <Input
            {...p}
            type="text"
            inputMode="decimal"
            placeholder={t('Same as product', 'كسعر المنتج')}
            value={values.priceOverride}
            onChange={(e) => onChange({ ...values, priceOverride: e.target.value })}
            disabled={busy}
          />
        )}
      </Field>
      <Field label={t('Stock', 'المخزون')} error={errors.stockQuantity}>
        {(p) => (
          <Input
            {...p}
            type="number"
            step="1"
            value={values.stockQuantity}
            onChange={(e) => onChange({ ...values, stockQuantity: e.target.value })}
            disabled={busy}
          />
        )}
      </Field>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="icon-btn icon-btn--bordered"
          onClick={onSave}
          disabled={busy}
          aria-label={saveLabel}
          title={saveLabel}
        >
          <Icon as={Save} size={16} />
        </button>
        {onDelete && (
          <button
            type="button"
            className="icon-btn icon-btn--bordered"
            onClick={onDelete}
            disabled={busy || deleteDisabled}
            aria-label={t('Delete variant', 'حذف الخيار')}
            title={t('Delete variant', 'حذف الخيار')}
          >
            <Icon as={Trash2} size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Variants for an EXISTING product are managed as independent line items
 * (unlike the create page's single field-array submit) — each row has its
 * own Save/Delete calling the variant sub-resource endpoints directly, since
 * `useUpdateProduct` intentionally excludes `variants` from its body.
 */
export function VariantsManager({
  productId,
  variants,
  locale,
}: {
  productId: string;
  variants: ProductVariant[];
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const addVariant = useAddProductVariant();
  const updateVariant = useUpdateProductVariant();
  const deleteVariant = useDeleteProductVariant();

  const [rows, setRows] = useState<Record<string, RowValues>>(() =>
    Object.fromEntries(variants.map((v) => [v.id, toRowValues(v)]))
  );
  const [rowErrors, setRowErrors] = useState<Record<string, Partial<Record<keyof RowValues, string>>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newRow, setNewRow] = useState<RowValues>({ sku: '', size: '', color: '', priceOverride: '', stockQuantity: '0' });
  const [newRowErrors, setNewRowErrors] = useState<Partial<Record<keyof RowValues, string>>>({});

  const rowValuesFor = (v: ProductVariant) => rows[v.id] ?? toRowValues(v);

  const handleSave = async (variantId: string) => {
    const current = variants.find((v) => v.id === variantId);
    if (!current) return;
    const values = rows[variantId] ?? toRowValues(current);
    const errs = validate(values, t);
    setRowErrors((prev) => ({ ...prev, [variantId]: errs }));
    if (Object.keys(errs).length > 0) return;
    setError(null);
    setSavingId(variantId);
    try {
      await updateVariant.mutateAsync({
        id: productId,
        variantId,
        body: {
          sku: values.sku,
          size: values.size || null,
          color: values.color || null,
          price: values.priceOverride ? Number(values.priceOverride) : null,
          stockQuantity: Number(values.stockQuantity),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (variantId: string) => {
    if (variants.length <= 1) return;
    if (!window.confirm(t('Delete this variant?', 'حذف هذا الخيار؟'))) return;
    setError(null);
    setSavingId(variantId);
    try {
      await deleteVariant.mutateAsync({ id: productId, variantId });
      setRows((prev) => {
        const next = { ...prev };
        delete next[variantId];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    } finally {
      setSavingId(null);
    }
  };

  const handleAdd = async () => {
    const errs = validate(newRow, t);
    setNewRowErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setError(null);
    setSavingId('__new__');
    try {
      await addVariant.mutateAsync({
        id: productId,
        body: {
          sku: newRow.sku,
          size: newRow.size || null,
          color: newRow.color || null,
          price: newRow.priceOverride ? Number(newRow.priceOverride) : null,
          stockQuantity: Number(newRow.stockQuantity),
        },
      });
      setNewRow({ sku: '', size: '', color: '', priceOverride: '', stockQuantity: '0' });
      setNewRowErrors({});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Add failed', 'فشل الإضافة'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="admin-form__section">
      <p className="admin-form__section-title">{t('Variants', 'المقاسات والألوان')}</p>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="admin-variants-list">
        {variants.map((v) => (
          <VariantRow
            key={v.id}
            values={rowValuesFor(v)}
            onChange={(values) => setRows((prev) => ({ ...prev, [v.id]: values }))}
            errors={rowErrors[v.id] ?? {}}
            locale={locale}
            busy={savingId === v.id}
            onSave={() => handleSave(v.id)}
            onDelete={() => handleDelete(v.id)}
            deleteDisabled={variants.length <= 1}
            saveLabel={t('Save', 'حفظ')}
          />
        ))}
      </div>

      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-2)' }}>
        {t('Add a variant', 'إضافة خيار')}
      </p>
      <VariantRow
        values={newRow}
        onChange={setNewRow}
        errors={newRowErrors}
        locale={locale}
        busy={savingId === '__new__'}
        onSave={handleAdd}
        saveLabel={t('Add', 'إضافة')}
      />
    </div>
  );
}
