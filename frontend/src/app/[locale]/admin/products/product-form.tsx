'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { useCategories } from '@/hooks/use-catalog';

// Optional money fields are kept as strings in the form (not z.coerce.number
// — an empty box would coerce to NaN, which Zod can't cleanly validate as
// "absent"). '' means "not set"; the page's submit handler parses whatever's
// left to a number. Two decimal places, matching Decimal(12,2) server-side.
const priceStringSchema = z.string().regex(/^$|^\d+(\.\d{1,2})?$/, 'Must be empty or a positive number (e.g. 19.99)');

// The object schema (not yet refined) so admin/products/new/page.tsx can
// .extend() it with a variants field — z.object().refine() returns a
// ZodEffects, which can't be extended, so the refine is applied last, by
// both this schema and the create page's extended one, via the same
// `saleNeedsValue` check below.
export const productCoreObjectSchema = z.object({
  sku: z.string().min(1, 'Required'),
  nameEn: z.string().min(1, 'Required'),
  nameAr: z.string().min(1, 'Required'),
  descriptionEn: z.string(),
  descriptionAr: z.string(),
  categoryId: z.string().min(1, 'Required'),
  price: z.number().positive('Must be greater than 0'),
  compareAtPrice: priceStringSchema,
  // Free-standing signed quantity — may be 0 or negative, unrelated to isActive.
  quantity: z.number().int(),
  saleType: z.enum(['', 'PERCENT', 'AMOUNT']),
  saleValue: priceStringSchema,
});

export function saleNeedsValue(v: { saleType: string; saleValue: string }) {
  return v.saleType === '' || v.saleValue !== '';
}
const SALE_REFINE_OPTS = { message: 'Enter a sale value, or clear the sale type', path: ['saleValue'] };

export const productCoreSchema = productCoreObjectSchema.refine(saleNeedsValue, SALE_REFINE_OPTS);
export type ProductCoreValues = z.infer<typeof productCoreSchema>;

export const productCoreDefaults: ProductCoreValues = {
  sku: '',
  nameEn: '',
  nameAr: '',
  descriptionEn: '',
  descriptionAr: '',
  categoryId: '',
  price: 0,
  compareAtPrice: '',
  quantity: 0,
  saleType: '',
  saleValue: '',
};

/** The product-level fields shared by the create and edit pages — not a
 *  <form> itself (the caller owns that, since create additionally embeds a
 *  variants field-array in the same form/submit, while edit manages
 *  variants as independent line items below this). */
export function ProductCoreFields<T extends ProductCoreValues>({
  register,
  errors,
  busy,
  locale,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  busy: boolean;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: categories } = useCategories();

  return (
    <>
      <div className="admin-form__row">
        <Field label={t('Name (English)', 'الاسم (إنجليزي)')} error={errors.nameEn?.message as string | undefined} required>
          {(p) => <Input {...p} {...register('nameEn' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Name (Arabic)', 'الاسم (عربي)')} error={errors.nameAr?.message as string | undefined} required>
          {(p) => <Input {...p} {...register('nameAr' as never)} dir="rtl" disabled={busy} />}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field label={t('SKU', 'رمز المنتج')} error={errors.sku?.message as string | undefined} required>
          {(p) => <Input {...p} {...register('sku' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Category', 'الفئة')} error={errors.categoryId?.message as string | undefined} required>
          {(p) => (
            <Select {...p} {...register('categoryId' as never)} disabled={busy}>
              <option value="">{t('Select a category', 'اختر فئة')}</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {isAr ? c.nameAr : c.nameEn}
                  {c.collection ? ` — ${isAr ? c.collection.nameAr : c.collection.nameEn}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field label={t('Description (English)', 'الوصف (إنجليزي)')}>
          {(p) => <Textarea {...p} {...register('descriptionEn' as never)} rows={3} disabled={busy} />}
        </Field>
        <Field label={t('Description (Arabic)', 'الوصف (عربي)')}>
          {(p) => <Textarea {...p} {...register('descriptionAr' as never)} rows={3} dir="rtl" disabled={busy} />}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field label={t('Price', 'السعر')} error={errors.price?.message as string | undefined} required>
          {(p) => (
            <Input {...p} type="number" min={0} step="0.01" {...register('price' as never, { valueAsNumber: true })} disabled={busy} />
          )}
        </Field>
        <Field
          label={t('Compare-at price', 'السعر قبل التخفيض')}
          hint={t('Optional — shown struck through', 'اختياري — يظهر مشطوبًا')}
          error={errors.compareAtPrice?.message as string | undefined}
        >
          {(p) => <Input {...p} type="text" inputMode="decimal" placeholder="0.00" {...register('compareAtPrice' as never)} disabled={busy} />}
        </Field>
      </div>

      <Field
        label={t('Quantity', 'الكمية')}
        hint={t('May be 0 or negative — independent of active status', 'قد تكون 0 أو سالبة — مستقلة عن حالة التفعيل')}
        error={errors.quantity?.message as string | undefined}
      >
        {(p) => <Input {...p} type="number" step="1" {...register('quantity' as never, { valueAsNumber: true })} disabled={busy} />}
      </Field>

      <div className="admin-form__row">
        <Field label={t('Sale type', 'نوع التخفيض')}>
          {(p) => (
            <Select {...p} {...register('saleType' as never)} disabled={busy}>
              <option value="">{t('No sale', 'بدون تخفيض')}</option>
              <option value="PERCENT">{t('Percent off', 'نسبة مئوية')}</option>
              <option value="AMOUNT">{t('Amount off', 'مبلغ ثابت')}</option>
            </Select>
          )}
        </Field>
        <Field
          label={t('Sale value', 'قيمة التخفيض')}
          hint={t('0–100 for percent, or a flat amount', '0–100 للنسبة، أو مبلغ ثابت')}
          error={errors.saleValue?.message as string | undefined}
        >
          {(p) => <Input {...p} type="text" inputMode="decimal" placeholder="0.00" {...register('saleValue' as never)} disabled={busy} />}
        </Field>
      </div>
    </>
  );
}
