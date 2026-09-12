'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { useAdminCategories, useCollections } from '@/hooks/use-catalog';

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
//
// No `quantity` field here on purpose (fix-list.md #16) — `Product.quantity`
// is a dead, free-standing DB column never derived from or validated against
// variant stock, and every real product always has ≥1 variant (creation
// requires it; deleteVariant() blocks going to zero — fix-list.md #17), so
// editing it here could only ever mislead an admin into thinking it affects
// availability. Left unset server-side, which keeps its schema default (0).
// The list page shows a computed sum of variant stock in its place instead —
// see admin/products/page.tsx.
export const productCoreObjectSchema = z.object({
  sku: z.string().min(1, 'Required'),
  nameEn: z.string().min(1, 'Required'),
  nameAr: z.string().min(1, 'Required'),
  descriptionEn: z.string(),
  descriptionAr: z.string(),
  primaryCategoryId: z.string().min(1, 'Required'),
  // Zero or more ADDITIONAL (non-canonical) category placements, and manual
  // collection memberships — Stage 1 catalog redesign (see ProductCategory /
  // CollectionProduct). Plain string arrays: a native multi-select's value.
  additionalCategoryIds: z.array(z.string()),
  collectionIds: z.array(z.string()),
  price: z.number().positive('Must be greater than 0'),
  compareAtPrice: priceStringSchema,
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
  primaryCategoryId: '',
  additionalCategoryIds: [],
  collectionIds: [],
  price: 0,
  compareAtPrice: '',
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
  const { data: categories } = useAdminCategories();
  const { data: collections } = useCollections({ includeInactive: true });

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
        <Field
          label={t('Primary category', 'الفئة الأساسية')}
          hint={t('Canonical placement — breadcrumbs, URL, reporting', 'الموضع الأساسي — مسار التصفح والرابط والتقارير')}
          error={errors.primaryCategoryId?.message as string | undefined}
          required
        >
          {(p) => (
            <Select {...p} {...register('primaryCategoryId' as never)} disabled={busy}>
              <option value="">{t('Select a category', 'اختر فئة')}</option>
              {(categories ?? []).map((c) => (
                // Flagged, not excluded, when this category (or an ancestor)
                // is archived — the category row itself may still be
                // perfectly valid, just currently unreachable on the
                // storefront (fix-list.md #15's principle, carried onto the
                // tree — see category-tree.ts's archivedCategoryIds()).
                <option key={c.id} value={c.id} disabled={Boolean(c.isEffectivelyArchived)}>
                  {'—'.repeat(c.depth)} {isAr ? c.nameAr : c.nameEn}
                  {c.isEffectivelyArchived ? t(' (archived)', ' (مؤرشفة)') : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field
          label={t('Additional categories', 'فئات إضافية')}
          hint={t('Optional — other places this product also appears (ctrl/cmd-click to select several)', 'اختياري — أماكن أخرى يظهر فيها المنتج أيضًا (اضغط ctrl/cmd للاختيار المتعدد)')}
        >
          {(p) => (
            <select
              {...p}
              multiple
              {...register('additionalCategoryIds' as never)}
              disabled={busy}
              className="input"
              size={Math.min(6, Math.max(3, (categories ?? []).length))}
            >
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id} disabled={Boolean(c.isEffectivelyArchived)}>
                  {'—'.repeat(c.depth)} {isAr ? c.nameAr : c.nameEn}
                  {c.isEffectivelyArchived ? t(' (archived)', ' (مؤرشفة)') : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={t('Collections', 'المجموعات')}
          hint={t('Optional — manual merchandising groups (Sale, New Arrivals)', 'اختياري — مجموعات تسويقية يدوية (تخفيضات، وصل حديثاً)')}
        >
          {(p) => (
            <select
              {...p}
              multiple
              {...register('collectionIds' as never)}
              disabled={busy}
              className="input"
              size={Math.min(6, Math.max(3, (collections ?? []).length))}
            >
              {(collections ?? []).map((c) => (
                <option key={c.id} value={c.id} disabled={Boolean(c.archivedAt)}>
                  {isAr ? c.nameAr : c.nameEn}
                  {c.archivedAt ? t(' (archived)', ' (مؤرشفة)') : ''}
                </option>
              ))}
            </select>
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
