'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Field, Icon, Input } from '@/components/ui';
import { useCreateProduct } from '@/hooks/use-catalog';
import { ProductCoreFields, productCoreDefaults, productCoreObjectSchema, saleNeedsValue } from '../product-form';

const variantSchema = z.object({
  sku: z.string().min(1, 'Required'),
  // '' = no size/colour for this variant (a single undifferentiated option).
  size: z.string(),
  color: z.string(),
  priceOverride: z.string().regex(/^$|^\d+(\.\d{1,2})?$/, 'Must be empty or a positive number'),
  stockQuantity: z.number().int().nonnegative(),
});

const createSchema = productCoreObjectSchema
  .extend({ variants: z.array(variantSchema).min(1, 'Add at least one variant') })
  .refine(saleNeedsValue, { message: 'Enter a sale value, or clear the sale type', path: ['saleValue'] });
type CreateValues = z.infer<typeof createSchema>;

const blankVariant = { sku: '', size: '', color: '', priceOverride: '', stockQuantity: 0 };

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
    resolver: zodResolver(createSchema),
    defaultValues: { ...productCoreDefaults, variants: [blankVariant] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'variants' });

  const busy = createProduct.isPending;

  const onSubmit = async (values: CreateValues) => {
    setError(null);
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
        compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : undefined,
        saleType: values.saleType || null,
        saleValue: values.saleValue ? Number(values.saleValue) : null,
        variants: values.variants.map((v) => ({
          sku: v.sku,
          size: v.size || null,
          color: v.color || null,
          price: v.priceOverride ? Number(v.priceOverride) : null,
          stockQuantity: v.stockQuantity,
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

          {fields.map((field, i) => (
            <div key={field.id} className="admin-variant-row">
              <Field label={t('SKU', 'رمز')} error={errors.variants?.[i]?.sku?.message} required>
                {(p) => <Input {...p} {...register(`variants.${i}.sku` as const)} disabled={busy} />}
              </Field>
              <Field label={t('Size', 'المقاس')}>
                {(p) => <Input {...p} {...register(`variants.${i}.size` as const)} disabled={busy} />}
              </Field>
              <Field label={t('Colour', 'اللون')}>
                {(p) => <Input {...p} {...register(`variants.${i}.color` as const)} disabled={busy} />}
              </Field>
              <Field label={t('Price override', 'سعر خاص')} error={errors.variants?.[i]?.priceOverride?.message}>
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    placeholder={t('Same as product', 'كسعر المنتج')}
                    {...register(`variants.${i}.priceOverride` as const)}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label={t('Stock', 'المخزون')} error={errors.variants?.[i]?.stockQuantity?.message}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    step="1"
                    {...register(`variants.${i}.stockQuantity` as const, { valueAsNumber: true })}
                    disabled={busy}
                  />
                )}
              </Field>
              <button
                type="button"
                className="icon-btn icon-btn--bordered admin-variant-row__remove"
                onClick={() => remove(i)}
                disabled={busy || fields.length <= 1}
                aria-label={t('Remove variant', 'حذف الخيار')}
              >
                <Icon as={Trash2} size={16} />
              </button>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={() => append(blankVariant)} disabled={busy}>
            <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('Add variant', 'إضافة خيار')}
          </Button>
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
