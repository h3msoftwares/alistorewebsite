'use client';

import { useState } from 'react';
import { Controller, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Field, Icon, Input, Select } from '@/components/ui';
import { useProduct, useProducts } from '@/hooks/use-catalog';
import { usePreviewComboCoverage } from '@/hooks/use-combos';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { ComboRule, ComboRuleBody } from '@/lib/types';
import { fromLocalInput, toLocalInput } from '../discounts/datetime-local';

const tierSchema = z.object({
  minQty: z.number({ message: 'Enter a number' }).int().min(1).max(2_147_483_647),
  price: z.number({ message: 'Enter a number' }).positive().max(1_000_000).multipleOf(0.01),
});
export const comboRuleSchema = z.object({
  nameEn: z.string().trim().min(1, 'Required'),
  nameAr: z.string().trim().min(1, 'Required'),
  priority: z.number({ message: 'Enter a number' }).int().min(0),
  productIds: z.array(z.string()).length(1, 'Select exactly one product'),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']),
  startsAt: z.string(), endsAt: z.string(),
  tiers: z.array(tierSchema).min(1, 'Add at least one tier').max(20),
}).superRefine((v, ctx) => {
  if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Must be after the start' });
  }
  if (new Set(v.tiers.map((tier) => tier.minQty)).size !== v.tiers.length) {
    ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'Each band must have a different minimum quantity' });
  }
});
export type ComboRuleFormValues = z.infer<typeof comboRuleSchema>;
const blankTier = { minQty: 1, price: 0 };
export const blankComboRuleValues: ComboRuleFormValues = {
  nameEn: '', nameAr: '', priority: 0, productIds: [], status: 'DRAFT',
  startsAt: '', endsAt: '', tiers: [blankTier],
};
export function comboRuleValuesFromExisting(r: ComboRule): ComboRuleFormValues {
  return {
    nameEn: r.nameEn, nameAr: r.nameAr, priority: r.priority,
    productIds: r.products.map((p) => p.productID), status: r.status,
    startsAt: toLocalInput(r.startsAt), endsAt: toLocalInput(r.endsAt),
    tiers: r.tiers.map((tier) => ({ minQty: tier.minQty, price: Number(tier.price) })),
  };
}
export function comboRuleBodyFromValues(form: ComboRuleFormValues): ComboRuleBody {
  return {
    ...form, appliesToAll: false, categoryTargets: [], collectionIds: [],
    startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt),
    tiers: [...form.tiers].sort((a, b) => a.minQty - b.minQty).map(({ minQty, price }) => ({ minQty, price })),
  };
}
type ProductDetails = Record<string, { nameEn: string; nameAr: string; sku: string }>;

export function ComboRuleFormFields<T extends ComboRuleFormValues>({
  register, control, errors, busy, locale, initialProductDetails,
}: {
  register: UseFormRegister<T>; control: Control<T>; errors: FieldErrors<T>;
  busy: boolean; locale: 'en' | 'ar'; initialProductDetails?: ProductDetails;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => isAr ? ar : en;
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const { data: products } = useProducts({ status: 'all', pageSize: 60, search: debounced || undefined }, { keepPreviousData: false });
  const productIds = useWatch({ control, name: 'productIds' as never }) as unknown as string[];
  const selectedProduct = useProduct(productIds?.[0]);
  const tierValues = useWatch({ control, name: 'tiers' as never }) as unknown as ComboRuleFormValues['tiers'];
  const tiers = useFieldArray({ control, name: 'tiers' as never });
  const sorted = [...(tierValues ?? [])].sort((a, b) => a.minQty - b.minQty);
  const tierErrors = errors.tiers as FieldErrors<ComboRuleFormValues>['tiers'];
  const tiersMessage = tierErrors?.root?.message ?? tierErrors?.message;
  const product = selectedProduct.data ?? products?.items.find((p) => p.id === productIds?.[0]);
  const bases = product ? (product.variants?.length ? product.variants : [{ sku: product.sku, price: product.price }])
    .map((v) => ({ sku: v.sku, cents: Math.round(Number(v.price ?? product.price) * 100) })) : [];
  const validTiers = sorted.length > 0 && new Set(sorted.map((tier) => tier.minQty)).size === sorted.length
    && sorted.every((tier) => tierSchema.safeParse(tier).success);
  const rateAt = (q: number, base: number) => {
    const tier = [...sorted].reverse().find((band) => q >= band.minQty);
    return tier ? Math.min(base, Math.round(tier.price * 100)) : base;
  };
  return (
    <>
      <div className="admin-form__row">
        <Field label={t('Name (English)', 'الاسم (إنجليزي)')} error={errors.nameEn?.message as string} required>
          {(p) => <Input {...p} {...register('nameEn' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Name (Arabic)', 'الاسم (عربي)')} error={errors.nameAr?.message as string} required>
          {(p) => <Input {...p} dir="rtl" {...register('nameAr' as never)} disabled={busy} />}
        </Field>
      </div>
      <Input aria-label={t('Search products', 'بحث المنتجات')} value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder={t('Search products…', 'ابحث عن منتج')} disabled={busy} />
      <Field label={t('Product', 'المنتج')} error={errors.productIds?.message as string}
        hint={t('Choose one product. Quantities are counted separately for each size/color variant.', 'اختر منتجاً واحداً. تُحسب كمية كل مقاس ولون على حدة.')}>
        {(p) => <Controller control={control} name={'productIds' as never} render={({ field }) => {
          const selected = (field.value as string[])[0] ?? '';
          return <Select {...p} value={selected} onChange={(e) => field.onChange(e.target.value ? [e.target.value] : [])} disabled={busy}>
            <option value="">{t('Select a product', 'اختر منتجاً')}</option>
            {selected && !products?.items.some((prod) => prod.id === selected) && <option value={selected}>
              {initialProductDetails?.[selected]?.[isAr ? 'nameAr' : 'nameEn'] ?? selected}
            </option>}
            {(products?.items ?? []).map((prod) => <option key={prod.id} value={prod.id} disabled={Boolean(prod.deletedAt)}>
              {isAr ? prod.nameAr : prod.nameEn} ({prod.sku})
            </option>)}
          </Select>;
        }} />}
      </Field>
      <div className="admin-form__row">
        <Field label={t('Priority', 'الأولوية')} error={errors.priority?.message as string}>
          {(p) => <Input {...p} type="number" min={0} {...register('priority' as never, { valueAsNumber: true })} disabled={busy} />}
        </Field>
        <Field label={t('Status', 'الحالة')}>
          {(p) => <Select {...p} {...register('status' as never)} disabled={busy}>
            <option value="DRAFT">{t('Draft', 'مسودة')}</option><option value="ACTIVE">{t('Active', 'نشط')}</option>
            <option value="PAUSED">{t('Paused', 'متوقف')}</option><option value="ENDED">{t('Ended', 'منتهٍ')}</option>
          </Select>}
        </Field>
      </div>
      <div className="admin-form__row">
        <Field label={t('Starts', 'يبدأ')} error={errors.startsAt?.message as string}>
          {(p) => <Input {...p} type="datetime-local" {...register('startsAt' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Ends', 'ينتهي')} error={errors.endsAt?.message as string}>
          {(p) => <Input {...p} type="datetime-local" {...register('endsAt' as never)} disabled={busy} />}
        </Field>
      </div>
      <p className="admin-form__hint">{t(
        'Quantity selects a rate for every unit of that variant. The lower of this rate and the sale/promotion price applies. Each range ends before the next minimum.',
        'تحدد الكمية سعر كل وحدة من الصنف. يُطبق الأقل بين هذا السعر وسعر التخفيض أو العرض. ينتهي كل نطاق قبل الحد الأدنى التالي.'
      )}</p>
      {tiers.fields.map((field, i) => {
        const minimum = tierValues?.[i]?.minQty;
        const next = sorted.find((tier) => tier.minQty > minimum);
        return <div key={field.id} className="admin-variant-row">
          <Field label={t('Min qty', 'أقل كمية')} error={tierErrors?.[i]?.minQty?.message as string}>
            {(p) => <Input {...p} type="number" min={1} step={1} {...register(`tiers.${i}.minQty` as never, { valueAsNumber: true })} disabled={busy} />}
          </Field>
          <p>{t('Range:', 'النطاق:')} {Number.isInteger(minimum) ? next ? `${minimum}–${next.minQty - 1}` : `${minimum}+` : '—'}</p>
          <Field label={t('Price per unit ($)', 'السعر للوحدة ($)')} error={tierErrors?.[i]?.price?.message as string}>
            {(p) => <Input {...p} type="number" min={0.01} step="0.01" {...register(`tiers.${i}.price` as never, { valueAsNumber: true })} disabled={busy} />}
          </Field>
          <button type="button" className="icon-btn icon-btn--bordered" onClick={() => tiers.remove(i)}
            disabled={busy || tiers.fields.length <= 1} aria-label={t('Remove tier', 'حذف الشريحة')}><Icon as={Trash2} size={16} /></button>
        </div>;
      })}
      {tiersMessage && <Alert tone="danger">{tiersMessage}</Alert>}
      {validTiers && bases.map((base) => <div key={base.sku} className="stack">
        <p className="admin-form__hint">{t('Boundary totals at regular price', 'الإجمالي عند حدود الشرائح بالسعر العادي')} — {base.sku}</p>
        {sorted.filter((tier) => tier.minQty > 1).map((tier) => {
          const before = (tier.minQty - 1) * rateAt(tier.minQty - 1, base.cents);
          const after = tier.minQty * rateAt(tier.minQty, base.cents);
          return <p key={tier.minQty} className={after <= before ? 'form-error' : 'admin-form__hint'}>
            {tier.minQty - 1} × ${(rateAt(tier.minQty - 1, base.cents) / 100).toFixed(2)} = ${(before / 100).toFixed(2)};{' '}
            {tier.minQty} × ${(rateAt(tier.minQty, base.cents) / 100).toFixed(2)} = ${(after / 100).toFixed(2)}
            {after <= before && ` — ${t('Total must strictly increase.', 'يجب أن يزيد الإجمالي.')}`}
          </p>;
        })}
      </div>)}
      <p className="admin-form__hint">{t('Saving also checks current sale and promotion prices for every variant.', 'عند الحفظ تُفحص أيضاً أسعار التخفيضات والعروض الحالية لكل صنف.')}</p>
      {tiers.fields.length < 20 && <Button type="button" variant="outline" onClick={() => tiers.append(blankTier as never)} disabled={busy}>
        <Icon as={Plus} size={16} /> {t('Add tier', 'إضافة شريحة')}
      </Button>}
    </>
  );
}

export function ComboCoveragePreviewSection({
  getValues,
  locale,
}: {
  getValues: () => ComboRuleFormValues;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const previewCoverage = usePreviewComboCoverage();

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={previewCoverage.isPending}
        onClick={() => {
          const v = getValues();
          previewCoverage.mutate({
            appliesToAll: false,
            productIds: v.productIds,
            categoryTargets: [],
            collectionIds: [],
          });
        }}
      >
        {t('Preview matching products', 'معاينة المنتجات المطابقة')}
      </Button>
      {previewCoverage.data && (
        <p className="admin-form__hint" style={{ marginTop: 'var(--space-2)' }}>
          {t(
            `Currently matches ${previewCoverage.data.count} live product(s).`,
            `يطابق حاليًا ${previewCoverage.data.count} منتج حيّ.`
          )}
          {previewCoverage.data.sample.length > 0 &&
            ` ${t('For example:', 'على سبيل المثال:')} ${previewCoverage.data.sample
              .map((s) => (isAr ? s.nameAr : s.nameEn))
              .join(', ')}${previewCoverage.data.count > previewCoverage.data.sample.length ? '…' : ''}`}
        </p>
      )}
      {previewCoverage.isError && (
        <Alert tone="danger" className="stack">
          {t('Could not compute the preview.', 'تعذّر حساب المعاينة.')}
        </Alert>
      )}
    </div>
  );
}
