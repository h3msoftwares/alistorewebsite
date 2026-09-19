'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Alert, Button, Choice, DataTable, Field, Icon, Input } from '@/components/ui';
import { ColorPicker } from '@/components/admin/color-picker';

/** One row of the matrix — a plain draft shape shared by the create page
 *  (no `id` yet) and the edit page (`id` present = an existing variant to
 *  update; absent = a new one to create on save). `size`/`color`/
 *  `priceOverride` are '' for "unset", matching the existing convention. */
export interface DraftVariantRow {
  key: string;
  id?: string;
  sku: string;
  size: string;
  color: string;
  priceOverride: string;
  stockQuantity: string;
}

let rowSeq = 0;
export function newVariantRowKey(): string {
  rowSeq += 1;
  return `row-${rowSeq}-${Date.now()}`;
}

export function blankVariantRow(): DraftVariantRow {
  return { key: newVariantRowKey(), sku: '', size: '', color: '', priceOverride: '', stockQuantity: '0' };
}

export type VariantFieldErrors = Partial<Record<'sku' | 'priceOverride' | 'stockQuantity', string>>;

const PRICE_RE = /^$|^\d+(\.\d{1,2})?$/;

function validateRow(row: DraftVariantRow, t: (en: string, ar: string) => string): VariantFieldErrors {
  const errors: VariantFieldErrors = {};
  if (!row.sku.trim()) errors.sku = t('Required', 'مطلوب');
  if (!PRICE_RE.test(row.priceOverride)) {
    errors.priceOverride = t('Must be empty or a positive number', 'يجب أن يكون فارغًا أو رقمًا موجبًا');
  }
  const qty = Number(row.stockQuantity);
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) {
    errors.stockQuantity = t('Must be a non-negative whole number', 'يجب أن يكون رقمًا صحيحًا غير سالب');
  }
  return errors;
}

/** Per-row field errors + one form-level error (duplicate size/colour, or no
 *  rows at all) — the same two checks product.service.ts's
 *  assertNoDuplicateVariants and the ≥1-variant guard make server-side,
 *  surfaced before the request round-trip instead of after. */
export function validateVariantRows(
  rows: DraftVariantRow[],
  t: (en: string, ar: string) => string
): { errorsByKey: Record<string, VariantFieldErrors>; formError: string | null; valid: boolean } {
  const errorsByKey: Record<string, VariantFieldErrors> = {};
  for (const row of rows) {
    const err = validateRow(row, t);
    if (Object.keys(err).length) errorsByKey[row.key] = err;
  }

  let formError: string | null = null;
  if (rows.length === 0) {
    formError = t('Add at least one variant', 'أضف خيارًا واحدًا على الأقل');
  } else {
    const seen = new Set<string>();
    for (const row of rows) {
      const dedupeKey = `${row.size.trim().toLowerCase()}::${row.color.trim().toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        formError = t('Duplicate variant (same size and colour)', 'خيار مكرر (نفس المقاس واللون)');
        break;
      }
      seen.add(dedupeKey);
    }
  }

  return { errorsByKey, formError, valid: formError === null && Object.keys(errorsByKey).length === 0 };
}

export interface VariantsMatrixProps {
  rows: DraftVariantRow[];
  onChange: (rows: DraftVariantRow[]) => void;
  /** Keyed by row.key. */
  errors?: Record<string, VariantFieldErrors>;
  busy?: boolean;
  locale: 'en' | 'ar';
  /** Removing a row (single or bulk) is blocked once this many would remain. */
  minRows?: number;
  /** Prefixes the SKU the matrix generator suggests for each new combination. */
  skuPrefix?: string;
}

/**
 * A size×colour matrix editor: generate every combination of two axes at
 * once, edit every variant inline in one table, and act on many rows at
 * once (bulk stock/price, bulk delete) — the scalable replacement for
 * stacking one form-row per variant, which stopped working once a product
 * had more than a handful.
 */
export function VariantsMatrix({
  rows,
  onChange,
  errors = {},
  busy = false,
  locale,
  minRows = 1,
  skuPrefix,
}: VariantsMatrixProps) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sizesInput, setSizesInput] = useState('');
  const [colorSwatches, setColorSwatches] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [bulkStock, setBulkStock] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);

  const updateRow = (key: string, patch: Partial<DraftVariantRow>) => {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    if (rows.length <= minRows) return;
    onChange(rows.filter((r) => r.key !== key));
    setSelected((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const addRow = () => onChange([...rows, blankVariantRow()]);

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.key)));

  const applyBulkStock = () => {
    setBulkError(null);
    const qty = Number(bulkStock);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) {
      setBulkError(t('Enter a non-negative whole number', 'أدخل رقمًا صحيحًا غير سالب'));
      return;
    }
    onChange(rows.map((r) => (selected.has(r.key) ? { ...r, stockQuantity: String(qty) } : r)));
  };

  const applyBulkPrice = () => {
    setBulkError(null);
    if (!PRICE_RE.test(bulkPrice)) {
      setBulkError(t('Enter a positive number, or leave blank to clear', 'أدخل رقمًا موجبًا، أو اتركه فارغًا لإزالته'));
      return;
    }
    onChange(rows.map((r) => (selected.has(r.key) ? { ...r, priceOverride: bulkPrice } : r)));
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    if (rows.length - selected.size < minRows) {
      setBulkError(
        t(
          `At least ${minRows} variant(s) must remain.`,
          `يجب أن يبقى ${minRows} خيار على الأقل.`
        )
      );
      return;
    }
    setBulkError(null);
    onChange(rows.filter((r) => !selected.has(r.key)));
    setSelected(new Set());
  };

  const addColorSwatch = (hex: string) => {
    setColorSwatches((prev) => (prev.includes(hex) ? prev : [...prev, hex]));
  };

  const removeColorSwatch = (hex: string) => {
    setColorSwatches((prev) => prev.filter((c) => c !== hex));
  };

  const generateMatrix = () => {
    setGenError(null);
    const sizes = sizesInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (sizes.length === 0 && colorSwatches.length === 0) {
      setGenError(t('Enter a size or pick at least one colour', 'أدخل مقاسًا أو اختر لونًا واحدًا على الأقل'));
      return;
    }
    const axisSizes = sizes.length ? sizes : [''];
    // Colours are picked from the wheel below as real hex values directly —
    // no name→hex lookup needed, since the picked hex *is* the value stored
    // on the variant (same as the per-row colour-wheel picker in the table).
    const axisColors = colorSwatches.length
      ? colorSwatches.map((hex) => ({ name: hex.replace('#', '').toUpperCase(), hex }))
      : [{ name: '', hex: '' }];
    const seen = new Set(rows.map((r) => `${r.size.trim().toLowerCase()}::${r.color.trim().toLowerCase()}`));

    const additions: DraftVariantRow[] = [];
    for (const size of axisSizes) {
      for (const color of axisColors) {
        const dedupeKey = `${size.trim().toLowerCase()}::${color.hex.trim().toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const sku = [skuPrefix, size, color.name]
          .filter(Boolean)
          .join('-')
          .toUpperCase()
          .replace(/\s+/g, '-');
        additions.push({ ...blankVariantRow(), size, color: color.hex, sku });
      }
    }
    if (additions.length === 0) {
      setGenError(t('Every combination already exists below', 'كل التوليفات موجودة أدناه بالفعل'));
      return;
    }
    // A brand-new, still-blank starter row is replaced rather than left
    // behind as an empty leftover once real rows exist.
    const base = rows.length === 1 && !rows[0].sku && !rows[0].size && !rows[0].color ? [] : rows;
    onChange([...base, ...additions]);
    setSizesInput('');
    setColorSwatches([]);
  };

  return (
    <div>
      <div className="admin-form__row" style={{ alignItems: 'end' }}>
        <div className="field">
          <label className="field__label">{t('Sizes', 'المقاسات')}</label>
          <Input
            value={sizesInput}
            onChange={(e) => setSizesInput(e.target.value)}
            placeholder={t('e.g. S, M, L', 'مثال: S, M, L')}
            disabled={busy}
          />
        </div>
        <div className="field">
          <label className="field__label">{t('Colours', 'الألوان')}</label>
          <div className="colour-swatch-list">
            {colorSwatches.map((hex) => (
              <span key={hex} className="colour-swatch-chip" style={{ background: hex }} title={hex.toUpperCase()}>
                <button
                  type="button"
                  className="colour-swatch-chip__remove"
                  onClick={() => removeColorSwatch(hex)}
                  disabled={busy}
                  aria-label={t('Remove colour', 'إزالة اللون')}
                  title={t('Remove colour', 'إزالة اللون')}
                >
                  <Icon as={X} size={10} />
                </button>
              </span>
            ))}
            <label className="colour-swatch-add" title={t('Add colour', 'إضافة لون')}>
              <input
                type="color"
                value="#000000"
                onChange={(e) => {
                  addColorSwatch(e.target.value);
                }}
                disabled={busy}
                aria-label={t('Add colour', 'إضافة لون')}
              />
              <Icon as={Plus} size={14} />
            </label>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={generateMatrix} disabled={busy}>
          {t('Generate matrix', 'توليد المصفوفة')}
        </Button>
      </div>
      {genError && (
        <p className="field__error" role="alert">
          {genError}
        </p>
      )}
      <p className="admin-form__hint">
        {t(
          'Sizes are comma-separated. Pick one or more colours with the wheel. Adds every combination below that doesn’t already exist.',
          'المقاسات مفصولة بفواصل. اختر لونًا واحدًا أو أكثر من العجلة. يضيف كل توليفة أدناه غير موجودة بالفعل.'
        )}
      </p>

      <DataTable responsive maxHeight="26rem" style={{ marginTop: 'var(--space-4)' }}>
        <thead>
          <tr>
            <th style={{ width: '2.5em' }}>
              <Choice
                type="checkbox"
                label={<span className="visually-hidden">{t('Select all', 'تحديد الكل')}</span>}
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={busy || rows.length === 0}
              />
            </th>
            <th>{t('SKU', 'رمز')}</th>
            <th>{t('Size', 'المقاس')}</th>
            <th>{t('Colour', 'اللون')}</th>
            <th>{t('Price override', 'سعر خاص')}</th>
            <th className="is-numeric">{t('Stock', 'المخزون')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const err = errors[row.key] ?? {};
            return (
              <tr key={row.key} aria-selected={selected.has(row.key)}>
                <td data-label={t('Selected', 'محدَّد')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('Select this variant', 'تحديد هذا الخيار')}</span>}
                    checked={selected.has(row.key)}
                    onChange={() => toggleSelected(row.key)}
                    disabled={busy}
                  />
                </td>
                <td data-label={t('SKU', 'رمز')}>
                  <Input
                    value={row.sku}
                    onChange={(e) => updateRow(row.key, { sku: e.target.value })}
                    disabled={busy}
                    aria-invalid={err.sku ? true : undefined}
                  />
                  {err.sku && <p className="field__error">{err.sku}</p>}
                </td>
                <td data-label={t('Size', 'المقاس')}>
                  <Input value={row.size} onChange={(e) => updateRow(row.key, { size: e.target.value })} disabled={busy} />
                </td>
                <td data-label={t('Colour', 'اللون')}>
                  <ColorPicker
                    value={row.color}
                    onChange={(color) => updateRow(row.key, { color })}
                    locale={locale}
                    disabled={busy}
                  />
                </td>
                <td data-label={t('Price override', 'سعر خاص')}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={t('Same as product', 'كسعر المنتج')}
                    value={row.priceOverride}
                    onChange={(e) => updateRow(row.key, { priceOverride: e.target.value })}
                    disabled={busy}
                    aria-invalid={err.priceOverride ? true : undefined}
                  />
                  {err.priceOverride && <p className="field__error">{err.priceOverride}</p>}
                </td>
                <td className="is-numeric" data-label={t('Stock', 'المخزون')}>
                  <Input
                    type="number"
                    step="1"
                    value={row.stockQuantity}
                    onChange={(e) => updateRow(row.key, { stockQuantity: e.target.value })}
                    disabled={busy}
                    aria-invalid={err.stockQuantity ? true : undefined}
                  />
                  {err.stockQuantity && <p className="field__error">{err.stockQuantity}</p>}
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-btn icon-btn--bordered"
                    onClick={() => removeRow(row.key)}
                    disabled={busy || rows.length <= minRows}
                    aria-label={t('Remove variant', 'حذف الخيار')}
                    title={t('Remove variant', 'حذف الخيار')}
                  >
                    <Icon as={Trash2} size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      <div className="admin-page__head-actions" style={{ marginTop: 'var(--space-4)' }}>
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={busy}>
          <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {t('Add row', 'إضافة صف')}
        </Button>
        <span className="admin-form__hint">
          {selected.size > 0
            ? t(`${selected.size} selected`, `${selected.size} محدَّد`)
            : t('Select rows below to bulk-edit their stock or price, or delete them.', 'حدد صفوفًا أدناه لتعديل مخزونها أو سعرها دفعة واحدة، أو حذفها.')}
        </span>
      </div>

      {selected.size > 0 && (
        <div
          className="admin-form__row"
          style={{ marginTop: 'var(--space-3)', alignItems: 'start', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}
        >
          <div style={{ display: 'flex', alignItems: 'end', gap: 'var(--space-2)' }}>
            <Field label={t('Stock', 'المخزون')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="1"
                  value={bulkStock}
                  onChange={(e) => setBulkStock(e.target.value)}
                  disabled={busy}
                />
              )}
            </Field>
            <Button type="button" variant="outline" size="sm" onClick={applyBulkStock} disabled={busy}>
              {t('Apply', 'تطبيق')}
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: 'var(--space-2)' }}>
            <Field label={t('Price', 'السعر')} hint={t('blank clears it', 'الفراغ يزيله')}>
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  inputMode="decimal"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  disabled={busy}
                />
              )}
            </Field>
            <Button type="button" variant="outline" size="sm" onClick={applyBulkPrice} disabled={busy}>
              {t('Apply', 'تطبيق')}
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <Button type="button" variant="danger" size="sm" onClick={deleteSelected} disabled={busy}>
              {t('Delete', 'حذف')} ({selected.size})
            </Button>
          </div>
        </div>
      )}
      {bulkError && (
        <Alert tone="danger" className="stack">
          {bulkError}
        </Alert>
      )}
    </div>
  );
}
