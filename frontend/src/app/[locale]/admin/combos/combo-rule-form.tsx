'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Trash2, X } from 'lucide-react';
import { Alert, Button, CheckList, Choice, Field, Icon, Input, Select } from '@/components/ui';
import { useAdminCategories, useAdminCollections, useProducts } from '@/hooks/use-catalog';
import { usePreviewComboCoverage } from '@/hooks/use-combos';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { buildCategoryPaths } from '@/lib/category-path';
import type { ComboRule, ComboRuleBody } from '@/lib/types';
import { fromLocalInput, toLocalInput } from '../discounts/datetime-local';

const comboTierSchema = z
  .object({
    minQty: z.number({ message: 'Enter a number' }).int().min(1, 'Must be at least 1'),
    // A plain string in form state, same convention as settings-view.tsx's
    // freeDeliveryThreshold — '' means open-ended (null on the wire), not 0.
    maxQty: z.string(),
    price: z.number({ message: 'Enter a number' }).positive('Must be more than 0'),
  })
  .superRefine((t, ctx) => {
    if (t.maxQty.trim() === '') return;
    const n = Number(t.maxQty);
    if (!Number.isInteger(n) || n < 1) {
      ctx.addIssue({ code: 'custom', path: ['maxQty'], message: 'Whole number, or leave blank for no limit' });
      return;
    }
    if (n < t.minQty) {
      ctx.addIssue({ code: 'custom', path: ['maxQty'], message: 'Must be ≥ min quantity' });
    }
  });

export const comboRuleSchema = z
  .object({
    nameEn: z.string().trim().min(1, 'Required'),
    nameAr: z.string().trim().min(1, 'Required'),
    priority: z.number({ message: 'Enter a number' }).int(),
    appliesToAll: z.boolean(),
    productIds: z.array(z.string()),
    categoryTargets: z.array(z.object({ categoryId: z.string(), includeDescendants: z.boolean() })),
    collectionIds: z.array(z.string()),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']),
    startsAt: z.string(),
    endsAt: z.string(),
    tiers: z.array(comboTierSchema).min(1, 'Add at least one tier'),
  })
  .superRefine((v, ctx) => {
    if (
      !v.appliesToAll &&
      v.productIds.length === 0 &&
      v.categoryTargets.length === 0 &&
      v.collectionIds.length === 0
    ) {
      ctx.addIssue({ code: 'custom', path: ['appliesToAll'], message: 'Pick at least one target, or apply to all items' });
    }
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Must be after the start' });
    }
    // Same overlap check as the backend's tiersDontOverlap() — caught here
    // too so the admin sees it before submitting, not just on a 400.
    const sorted = [...v.tiers].sort((a, b) => a.minQty - b.minQty);
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].maxQty.trim() === '' ? Infinity : Number(sorted[i - 1].maxQty);
      if (sorted[i].minQty <= prevEnd) {
        ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'Tiers must not have overlapping quantity ranges' });
        break;
      }
    }
  });
export type ComboRuleFormValues = z.infer<typeof comboRuleSchema>;

const blankTier = { minQty: 1, maxQty: '', price: 0 };

export const blankComboRuleValues: ComboRuleFormValues = {
  nameEn: '',
  nameAr: '',
  priority: 0,
  appliesToAll: false,
  productIds: [],
  categoryTargets: [],
  collectionIds: [],
  status: 'DRAFT',
  startsAt: '',
  endsAt: '',
  tiers: [blankTier],
};

export function comboRuleValuesFromExisting(r: ComboRule): ComboRuleFormValues {
  return {
    nameEn: r.nameEn,
    nameAr: r.nameAr,
    priority: r.priority,
    appliesToAll: r.appliesToAll,
    productIds: r.products.map((x) => x.productID),
    categoryTargets: r.categories.map((c) => ({ categoryId: c.categoryID, includeDescendants: c.includeDescendants })),
    collectionIds: r.collections.map((c) => c.collectionID),
    status: r.status,
    startsAt: toLocalInput(r.startsAt),
    endsAt: toLocalInput(r.endsAt),
    tiers: r.tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty == null ? '' : String(t.maxQty), price: Number(t.price) })),
  };
}

export function comboRuleBodyFromValues(form: ComboRuleFormValues): ComboRuleBody {
  return {
    nameEn: form.nameEn,
    nameAr: form.nameAr,
    priority: form.priority,
    appliesToAll: form.appliesToAll,
    productIds: form.appliesToAll ? [] : form.productIds,
    categoryTargets: form.appliesToAll ? [] : form.categoryTargets,
    collectionIds: form.appliesToAll ? [] : form.collectionIds,
    status: form.status,
    startsAt: fromLocalInput(form.startsAt),
    endsAt: fromLocalInput(form.endsAt),
    tiers: form.tiers.map((t) => ({
      minQty: t.minQty,
      maxQty: t.maxQty.trim() === '' ? null : Number(t.maxQty),
      price: t.price,
    })),
  };
}

type ProductDetails = Record<string, { nameEn: string; nameAr: string; sku: string }>;

/**
 * Targeting fields (products/categories/collections/appliesToAll) mirror
 * promotion-form.tsx's PromotionFormFields exactly — same picker, same
 * backend target shape (catalog/targeting.ts). Priced by `tiers` instead of
 * a single type/value/stackable, since a combo rule prices a GROUP of units,
 * not one product in isolation — see lib/combo-pricing.ts.
 */
export function ComboRuleFormFields<T extends ComboRuleFormValues>({
  register,
  control,
  errors,
  busy,
  locale,
  initialProductDetails,
}: {
  register: UseFormRegister<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
  busy: boolean;
  locale: 'en' | 'ar';
  initialProductDetails?: ProductDetails;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const { data: products } = useProducts(
    { status: 'all', pageSize: 60, search: debouncedProductSearch || undefined },
    { keepPreviousData: false }
  );
  const { data: collections } = useAdminCollections({ status: 'all' });
  const { data: categories } = useAdminCategories({ status: 'all' });
  const categoryPaths = useMemo(() => buildCategoryPaths(categories ?? [], isAr), [categories, isAr]);

  const [productDetails, setProductDetails] = useState<ProductDetails>(initialProductDetails ?? {});
  useEffect(() => {
    if (!products?.items.length) return;
    setProductDetails((prev) => {
      const next = { ...prev };
      for (const p of products.items) next[p.id] = { nameEn: p.nameEn, nameAr: p.nameAr, sku: p.sku };
      return next;
    });
  }, [products]);

  const appliesToAll = useWatch({ control, name: 'appliesToAll' as never }) as unknown as boolean;
  const tiers = useFieldArray({ control, name: 'tiers' as never });
  const tierErrors = errors.tiers as FieldErrors<ComboRuleFormValues['tiers'][number]>[] | undefined;
  const tiersMessage = (errors.tiers as { message?: string } | undefined)?.message;

  return (
    <>
      <div className="admin-form__row">
        <Field label={t('Name (English)', 'الاسم (إنجليزي)')} error={errors.nameEn?.message as string | undefined} required>
          {(p) => <Input {...p} {...register('nameEn' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Name (Arabic)', 'الاسم (عربي)')} error={errors.nameAr?.message as string | undefined} required>
          {(p) => <Input {...p} dir="rtl" {...register('nameAr' as never)} disabled={busy} />}
        </Field>
      </div>

      <Choice
        type="checkbox"
        label={t('Applies to all items', 'يُطبَّق على كل المنتجات')}
        {...register('appliesToAll' as never)}
        disabled={busy}
      />

      {!appliesToAll && (
        <>
          <Field
            label={t('Products', 'المنتجات')}
            hint={t('Optional — search to narrow the list', 'اختياري — ابحث لتضييق القائمة')}
          >
            {(p) => (
              <>
                <Controller
                  control={control}
                  name={'productIds' as never}
                  render={({ field }) => {
                    const value = field.value as string[];
                    return (
                      <>
                        {value.length > 0 && (
                          <ul
                            role="list"
                            style={{
                              listStyle: 'none',
                              padding: 0,
                              margin: '0 0 var(--space-2)',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 'var(--space-2)',
                            }}
                          >
                            {value.map((id) => {
                              const details = productDetails[id];
                              const label = details ? (isAr ? details.nameAr : details.nameEn) : id;
                              return (
                                <li
                                  key={id}
                                  className="admin-selected-chip"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-1)',
                                    padding: '2px var(--space-1) 2px var(--space-3)',
                                    border: '1px solid var(--color-border-strong)',
                                    borderRadius: 'var(--radius-pill)',
                                    fontSize: 'var(--fs-sm)',
                                  }}
                                >
                                  {label}
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    aria-label={t(`Remove ${label}`, `إزالة ${label}`)}
                                    onClick={() => field.onChange(value.filter((v) => v !== id))}
                                    disabled={busy}
                                  >
                                    <Icon as={X} size={14} />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    );
                  }}
                />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={t('Search products…', 'ابحث عن منتج…')}
                  disabled={busy}
                  style={{ marginBottom: 'var(--space-2)' }}
                />
                <Controller
                  control={control}
                  name={'productIds' as never}
                  render={({ field }) => (
                    <CheckList
                      {...p}
                      value={field.value as string[]}
                      onChange={field.onChange}
                      disabled={busy}
                      emptyLabel={t('No products match', 'لا توجد منتجات مطابقة')}
                      items={(products?.items ?? []).map((prod) => ({
                        id: prod.id,
                        disabled: Boolean(prod.deletedAt),
                        label: `${isAr ? prod.nameAr : prod.nameEn}${prod.deletedAt ? t(' (archived)', ' (مؤرشفة)') : ''}`,
                      }))}
                    />
                  )}
                />
              </>
            )}
          </Field>

          <Field
            label={t('Categories', 'الفئات')}
            hint={t(
              'Optional — each category has its own "include subcategories" toggle below',
              'اختياري — لكل فئة مفتاح "شمول الفئات الفرعية" الخاص بها أدناه'
            )}
          >
            {(p) => (
              <Controller
                control={control}
                name={'categoryTargets' as never}
                render={({ field }) => {
                  const value = field.value as { categoryId: string; includeDescendants: boolean }[];
                  const selectedIds = value.map((v) => v.categoryId);
                  return (
                    <>
                      <CheckList
                        {...p}
                        value={selectedIds}
                        onChange={(ids) => {
                          const byId = new Map(value.map((v) => [v.categoryId, v]));
                          field.onChange(
                            ids.map((categoryId) => byId.get(categoryId) ?? { categoryId, includeDescendants: true })
                          );
                        }}
                        disabled={busy}
                        emptyLabel={t('No categories yet', 'لا توجد فئات بعد')}
                        items={(categories ?? []).map((c) => ({
                          id: c.id,
                          disabled: Boolean(c.isEffectivelyArchived),
                          label: `${isAr ? c.nameAr : c.nameEn}${c.isEffectivelyArchived ? t(' (archived)', ' (مؤرشفة)') : ''}`,
                          sublabel: categoryPaths.get(c.id) || undefined,
                        }))}
                      />
                      {value.length > 0 && (
                        <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                          {value.map((target) => {
                            const cat = (categories ?? []).find((c) => c.id === target.categoryId);
                            const path = categoryPaths.get(target.categoryId);
                            const catName = cat ? (isAr ? cat.nameAr : cat.nameEn) : target.categoryId;
                            const fullName = path ? `${path}${isAr ? ' « ' : ' › '}${catName}` : catName;
                            return (
                              <Choice
                                key={target.categoryId}
                                type="checkbox"
                                label={t(
                                  `Include subcategories of "${fullName}"`,
                                  `شمول الفئات الفرعية لـ "${fullName}"`
                                )}
                                checked={target.includeDescendants}
                                onChange={(e) =>
                                  field.onChange(
                                    value.map((v) =>
                                      v.categoryId === target.categoryId
                                        ? { ...v, includeDescendants: e.target.checked }
                                        : v
                                    )
                                  )
                                }
                                disabled={busy}
                              />
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                }}
              />
            )}
          </Field>

          <Field label={t('Collections', 'المجموعات')} hint={t('Optional', 'اختياري')}>
            {(p) => (
              <Controller
                control={control}
                name={'collectionIds' as never}
                render={({ field }) => (
                  <CheckList
                    {...p}
                    value={field.value as string[]}
                    onChange={field.onChange}
                    disabled={busy}
                    emptyLabel={t('No collections yet', 'لا توجد مجموعات بعد')}
                    items={(collections ?? []).map((c) => ({
                      id: c.id,
                      disabled: Boolean(c.archivedAt),
                      label: `${isAr ? c.nameAr : c.nameEn}${c.archivedAt ? t(' (archived)', ' (مؤرشفة)') : ''}`,
                    }))}
                  />
                )}
              />
            )}
          </Field>
          {errors.appliesToAll && <Alert tone="danger">{errors.appliesToAll.message as string}</Alert>}
        </>
      )}

      <div className="admin-form__row">
        <Field
          label={t('Priority', 'الأولوية')}
          hint={t(
            'Higher priority wins outright when two combo rules could cover the same product.',
            'الأولوية الأعلى تفوز بالكامل عندما يغطي عرضا تجميع نفس المنتج.'
          )}
          error={errors.priority?.message as string | undefined}
        >
          {(p) => <Input {...p} type="number" step="1" {...register('priority' as never, { valueAsNumber: true })} disabled={busy} />}
        </Field>
        <Field label={t('Status', 'الحالة')}>
          {(p) => (
            <Select {...p} {...register('status' as never)} disabled={busy}>
              <option value="DRAFT">{t('Draft', 'مسودة')}</option>
              <option value="ACTIVE">{t('Active', 'مُفعَّل')}</option>
              <option value="PAUSED">{t('Paused', 'موقوف مؤقتًا')}</option>
              <option value="ENDED">{t('Ended', 'منتهٍ')}</option>
            </Select>
          )}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field label={t('Starts', 'يبدأ')} hint={t('Blank = now', 'فارغ = الآن')} error={errors.startsAt?.message as string | undefined}>
          {(p) => <Input {...p} type="datetime-local" {...register('startsAt' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Ends', 'ينتهي')} hint={t('Blank = no end', 'فارغ = بلا نهاية')} error={errors.endsAt?.message as string | undefined}>
          {(p) => <Input {...p} type="datetime-local" {...register('endsAt' as never)} disabled={busy} />}
        </Field>
      </div>

      <Field label={t('Price tiers', 'شرائح السعر')}>
        {() => (
          <>
            <p className="admin-form__hint">
              {t(
                'A flat total price for buying a group of units within the given range (e.g. "2–3 pieces = $5"). The shopper always pays whichever is cheaper: this tier pricing, or each item priced individually.',
                'سعر إجمالي ثابت لشراء مجموعة من القطع ضمن النطاق المحدد (مثال: "2-3 قطع = 5$"). يدفع المتسوق دائمًا السعر الأقل بين هذا التسعير أو تسعير كل قطعة على حدة.'
              )}
            </p>
            {tiers.fields.map((field, i) => (
              <div key={field.id} className="admin-variant-row">
                <Field label={t('Min qty', 'أدنى كمية')} error={tierErrors?.[i]?.minQty?.message as string | undefined}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      step="1"
                      {...register(`tiers.${i}.minQty` as never, { valueAsNumber: true })}
                      disabled={busy}
                    />
                  )}
                </Field>
                <Field
                  label={t('Max qty', 'أقصى كمية')}
                  hint={t('Blank = no limit', 'فارغ = بلا حد')}
                  error={tierErrors?.[i]?.maxQty?.message as string | undefined}
                >
                  {(p) => (
                    <Input {...p} type="number" min={1} step="1" {...register(`tiers.${i}.maxQty` as never)} disabled={busy} />
                  )}
                </Field>
                <Field label={t('Price ($)', 'السعر ($)')} error={tierErrors?.[i]?.price?.message as string | undefined}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={0}
                      step="0.01"
                      {...register(`tiers.${i}.price` as never, { valueAsNumber: true })}
                      disabled={busy}
                    />
                  )}
                </Field>
                <button
                  type="button"
                  className="icon-btn icon-btn--bordered admin-variant-row__remove"
                  onClick={() => tiers.remove(i)}
                  disabled={busy || tiers.fields.length <= 1}
                  aria-label={t('Remove tier', 'حذف الشريحة')}
                >
                  <Icon as={Trash2} size={16} />
                </button>
              </div>
            ))}
            {tiersMessage && <Alert tone="danger">{tiersMessage}</Alert>}
            {tiers.fields.length < 20 && (
              <Button type="button" variant="outline" onClick={() => tiers.append(blankTier as never)} disabled={busy}>
                <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Add tier', 'إضافة شريحة')}
              </Button>
            )}
          </>
        )}
      </Field>
    </>
  );
}

/** "Which live products would this (possibly still-unsaved) target set
 *  cover" — same on-demand check as promotion-form.tsx's CoveragePreviewSection. */
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
            appliesToAll: v.appliesToAll,
            productIds: v.appliesToAll ? [] : v.productIds,
            categoryTargets: v.appliesToAll ? [] : v.categoryTargets,
            collectionIds: v.appliesToAll ? [] : v.collectionIds,
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
