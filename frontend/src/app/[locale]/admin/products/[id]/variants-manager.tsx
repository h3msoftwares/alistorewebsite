'use client';

import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { useSetProductVariants } from '@/hooks/use-catalog';
import type { ProductVariant } from '@/lib/types';
import {
  VariantsMatrix,
  validateVariantRows,
  type DraftVariantRow,
  type VariantFieldErrors,
} from '@/components/admin/variants-matrix';

function toDraftRow(v: ProductVariant): DraftVariantRow {
  return {
    key: v.id,
    id: v.id,
    sku: v.sku,
    size: v.size ?? '',
    color: v.color ?? '',
    priceOverride: v.price != null ? String(v.price) : '',
    stockQuantity: String(v.stockQuantity),
  };
}

/**
 * Variants for an EXISTING product, edited as one matrix and saved in a
 * single bulk call (`PUT /:id/variants`) instead of one request per row —
 * the create page's VariantsMatrix usage, reused here rather than a second,
 * divergent editor.
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
  const setVariants = useSetProductVariants();

  const [rows, setRows] = useState<DraftVariantRow[]>(() => variants.map(toDraftRow));
  const [errorsByKey, setErrorsByKey] = useState<Record<string, VariantFieldErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const busy = setVariants.isPending;

  const onSave = async () => {
    setSaved(false);
    const { errorsByKey: errs, formError: fe, valid } = validateVariantRows(rows, t);
    setErrorsByKey(errs);
    setFormError(fe);
    if (!valid) return;
    try {
      const saved = await setVariants.mutateAsync({
        id: productId,
        variants: rows.map((r) => ({
          id: r.id,
          sku: r.sku,
          size: r.size || null,
          color: r.color || null,
          price: r.priceOverride ? Number(r.priceOverride) : null,
          stockQuantity: Number(r.stockQuantity),
        })),
      });
      // Re-key freshly-created rows to their real ids so the next save
      // updates them instead of creating duplicates.
      setRows(saved.map(toDraftRow));
      setSaved(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  return (
    <div className="admin-form__section">
      <p className="admin-form__section-title">{t('Variants', 'المقاسات والألوان')}</p>

      <VariantsMatrix rows={rows} onChange={setRows} errors={errorsByKey} busy={busy} locale={locale} minRows={1} />

      {formError && (
        <Alert tone="danger" className="stack">
          {formError}
        </Alert>
      )}
      {saved && !formError && (
        <Alert tone="success" className="stack">
          {t('Variants saved', 'تم حفظ الخيارات')}
        </Alert>
      )}

      <div className="admin-form__actions">
        <Button type="button" onClick={onSave} loading={busy}>
          {t('Save all variants', 'حفظ كل الخيارات')}
        </Button>
      </div>
    </div>
  );
}
