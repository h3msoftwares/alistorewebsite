'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button } from '@/components/ui';
import { useCreateProduct } from '@/hooks/use-catalog';
import { ProductCoreFields, productCoreSchema, productCoreDefaults, type ProductCoreValues } from '../product-form';
import {
  VariantsMatrix,
  blankVariantRow,
  validateVariantRows,
  type DraftVariantRow,
  type VariantFieldErrors,
} from '@/components/admin/variants-matrix';

// Variants are validated separately (validateVariantRows) rather than as
// part of this zod schema — the matrix editor manages its own draft state,
// the same shape and validation the edit page's VariantsManager uses, so
// create and edit share one implementation instead of diverging again.
type CreateValues = ProductCoreValues;

export default function NewProductPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const createProduct = useCreateProduct();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(productCoreSchema),
    defaultValues: productCoreDefaults,
  });

  const [variantRows, setVariantRows] = useState<DraftVariantRow[]>([blankVariantRow()]);
  const [variantErrors, setVariantErrors] = useState<Record<string, VariantFieldErrors>>({});
  const [variantFormError, setVariantFormError] = useState<string | null>(null);

  const skuPrefix = useWatch({ control, name: 'sku' });
  const busy = createProduct.isPending;

  const onSubmit = async (values: CreateValues) => {
    setError(null);
    const { errorsByKey, formError, valid } = validateVariantRows(variantRows, t);
    setVariantErrors(errorsByKey);
    setVariantFormError(formError);
    if (!valid) return;

    try {
      const created = await createProduct.mutateAsync({
        sku: values.sku,
        nameEn: values.nameEn,
        nameAr: values.nameAr,
        descriptionEn: values.descriptionEn || undefined,
        descriptionAr: values.descriptionAr || undefined,
        primaryCategoryId: values.primaryCategoryId,
        additionalCategoryIds: values.additionalCategoryIds,
        collectionIds: values.collectionIds,
        price: values.price,
        saleType: values.saleType || null,
        saleValue: values.saleValue ? Number(values.saleValue) : null,
        variants: variantRows.map((v) => ({
          sku: v.sku,
          size: v.size || null,
          color: v.color || null,
          price: v.priceOverride ? Number(v.priceOverride) : null,
          stockQuantity: Number(v.stockQuantity),
        })),
      });
      // Images and further variant tweaks happen on the edit page.
      router.push(`/${locale}/admin/products/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Create failed', 'فشل الإنشاء'));
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('New product', 'منتج جديد')}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <ProductCoreFields register={register} control={control} errors={errors} busy={busy} locale={locale} />

        <div className="admin-form__section">
          <p className="admin-form__section-title">{t('Variants', 'المقاسات والألوان')}</p>
          <p className="admin-form__hint">
            {t(
              'Leave size/colour empty for a single, undifferentiated variant.',
              'اترك المقاس واللون فارغين لخيار واحد فقط دون تمييز.'
            )}
          </p>

          <VariantsMatrix
            rows={variantRows}
            onChange={setVariantRows}
            errors={variantErrors}
            busy={busy}
            locale={locale}
            minRows={1}
            skuPrefix={skuPrefix}
          />
          {variantFormError && (
            <Alert tone="danger" className="stack">
              {variantFormError}
            </Alert>
          )}
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Create', 'إنشاء')}
          </Button>
        </div>
      </form>

      <p className="admin-form__hint" style={{ marginTop: 'var(--space-4)' }}>
        {t('Images can be added once the product is created.', 'يمكن إضافة الصور بعد إنشاء المنتج.')}
      </p>
    </div>
  );
}
