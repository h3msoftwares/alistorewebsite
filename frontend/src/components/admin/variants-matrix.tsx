'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, DataTable, Field, Icon, Input } from '@/components/ui';

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
  const [colorsInput, setColorsInput] = useState('');
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

  const generateMatrix = () => {
    setGenError(null);
    const sizes = sizesInput.split(',').map((s) => s.trim()).filter(Boolean);
    const colors = colorsInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (sizes.length === 0 && colors.length === 0) {
      setGenError(t('Enter at least one size or colour', 'أدخل مقاسًا أو لونًا واحدًا على الأقل'));
      return;
    }
    const axisSizes = sizes.length ? sizes : [''];
    const axisColors = colors.length ? colors : [''];
    const seen = new Set(rows.map((r) => `${r.size.trim().toLowerCase()}::${r.color.trim().toLowerCase()}`));

    const additions: DraftVariantRow[] = [];
    for (const size of axisSizes) {
      for (const color of axisColors) {
        const dedupeKey = `${size.trim().toLowerCase()}::${color.trim().toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const sku = [skuPrefix, size, color]
          .filter(Boolean)
          .join('-')
          .toUpperCase()
          .replace(/\s+/g, '-');
        additions.push({ ...blankVariantRow(), size, color, sku });
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
    setColorsInput('');
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
          <Input
            value={colorsInput}
            onChange={(e) => setColorsInput(e.target.value)}
            placeholder={t('e.g. Black, White', 'مثال: أسود، أبيض')}
            disabled={busy}
          />
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
          'Comma-separated. Adds every size × colour combination below that doesn’t already exist.',
          'مفصولة بفواصل. يضيف كل توليفة مقاس × لون أدناه غير موجودة بالفعل.'
        )}
      </p>

      <DataTable responsive style={{ marginTop: 'var(--space-4)' }}>
        <thead>
          <tr>
            <th style={{ width: '2.5em' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label={t('Select all', 'تحديد الكل')}
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
                  <input
                    type="checkbox"
                    checked={selected.has(row.key)}
                    onChange={() => toggleSelected(row.key)}
                    aria-label={t('Select this variant', 'تحديد هذا الخيار')}
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
                  <Input value={row.color} onChange={(e) => updateRow(row.key, { color: e.target.value })} disabled={busy} />
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

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-4)',
        }}
      >
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={busy}>
          <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {t('Add row', 'إضافة صف')}
        </Button>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginInlineStart: 'auto',
            paddingInlineStart: 'var(--space-4)',
            borderInlineStart: '1px solid var(--color-border)',
          }}
        >
          <span className="admin-form__hint" style={{ whiteSpace: 'nowrap' }}>
            {selected.size > 0
              ? t(`${selected.size} selected:`, `${selected.size} محدَّد:`)
              : t('Select rows to act on them:', 'حدد صفوفًا للتعامل معها:')}
          </span>

          <div style={{ display: 'flex', alignItems: 'end', gap: 'var(--space-2)' }}>
            <Field label={t('Stock', 'المخزون')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="1"
                  value={bulkStock}
                  onChange={(e) => setBulkStock(e.target.value)}
                  disabled={busy || selected.size === 0}
                  style={{ width: '6rem' }}
                />
              )}
            </Field>
            <Button type="button" variant="outline" size="sm" onClick={applyBulkStock} disabled={busy || selected.size === 0}>
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
                  disabled={busy || selected.size === 0}
                  style={{ width: '6rem' }}
                />
              )}
            </Field>
            <Button type="button" variant="outline" size="sm" onClick={applyBulkPrice} disabled={busy || selected.size === 0}>
              {t('Apply', 'تطبيق')}
            </Button>
          </div>

          <Button type="button" variant="danger" size="sm" onClick={deleteSelected} disabled={busy || selected.size === 0}>
            {t('Delete', 'حذف')}
            {selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
        </div>
      </div>
      {bulkError && (
        <Alert tone="danger" className="stack">
          {bulkError}
        </Alert>
      )}
    </div>
  );
}
