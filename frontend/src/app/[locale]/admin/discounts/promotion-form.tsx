'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { X } from 'lucide-react';
import { Alert, Button, CheckList, Choice, Field, Icon, Input, Select } from '@/components/ui';
import { useAdminCategories, useAdminCollections, useProducts } from '@/hooks/use-catalog';
import { usePreviewPromotionCoverage } from '@/hooks/use-discounts';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { buildCategoryPaths } from '@/lib/category-path';
import type { Promotion, PromotionBody } from '@/lib/types';
import { fromLocalInput, toLocalInput } from './datetime-local';

export const promotionSchema = z
  .object({
    nameEn: z.string().trim().min(1, 'Required'),
    nameAr: z.string().trim().min(1, 'Required'),
    type: z.enum(['PERCENT', 'AMOUNT']),
    value: z.number({ message: 'Enter a number' }).positive('Must be more than 0'),
    priority: z.number({ message: 'Enter a number' }).int(),
    stackable: z.boolean(),
    appliesToAll: z.boolean(),
    // Plain string arrays: a native multi-select's value (same pattern as
    // the product form's additionalCategoryIds / collectionIds).
    productIds: z.array(z.string()),
    // Each target keeps its OWN includeDescendants — the backend already
    // supports this per-category (PromotionCategory.includeDescendants),
    // this form just used to collapse them all onto one shared checkbox.
    categoryTargets: z.array(z.object({ categoryId: z.string(), includeDescendants: z.boolean() })),
    collectionIds: z.array(z.string()),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'PERCENT' && v.value > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage is 0–100' });
    }
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
  });
export type PromotionFormValues = z.infer<typeof promotionSchema>;

export const blankPromotionValues: PromotionFormValues = {
  nameEn: '',
  nameAr: '',
  type: 'PERCENT',
  value: 10,
  priority: 0,
  stackable: true,
  appliesToAll: false,
  productIds: [],
  categoryTargets: [],
  collectionIds: [],
  status: 'DRAFT',
  startsAt: '',
  endsAt: '',
};

export function promotionValuesFromExisting(p: Promotion): PromotionFormValues {
  return {
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    type: p.type,
    value: Number(p.value),
    priority: p.priority,
    stackable: p.stackable,
    appliesToAll: p.appliesToAll,
    productIds: p.products.map((x) => x.productID),
    categoryTargets: p.categories.map((c) => ({ categoryId: c.categoryID, includeDescendants: c.includeDescendants })),
    collectionIds: p.collections.map((c) => c.collectionID),
    status: p.status,
    startsAt: toLocalInput(p.startsAt),
    endsAt: toLocalInput(p.endsAt),
  };
}

export function promotionBodyFromValues(form: PromotionFormValues): PromotionBody {
  return {
    nameEn: form.nameEn,
    nameAr: form.nameAr,
    type: form.type,
    value: form.value,
    priority: form.priority,
    stackable: form.stackable,
    appliesToAll: form.appliesToAll,
    productIds: form.appliesToAll ? [] : form.productIds,
    categoryTargets: form.appliesToAll ? [] : form.categoryTargets,
    collectionIds: form.appliesToAll ? [] : form.collectionIds,
    status: form.status,
    startsAt: fromLocalInput(form.startsAt),
    endsAt: fromLocalInput(form.endsAt),
  };
}

type ProductDetails = Record<string, { nameEn: string; nameAr: string; sku: string }>;

/**
 * Every field except Type/Value/Priority/Status/Starts/Ends/Stackable is
 * about *who this promotion targets* — products, categories, collections,
 * or "all of them". Shared by the create and edit pages so they can never
 * drift into two different forms again.
 */
export function PromotionFormFields<T extends PromotionFormValues>({
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
  /** Seeds the product-chip name/SKU lookup with an existing promotion's
   *  current targets, so they show a real name immediately on the edit page
   *  instead of just their raw id until a search happens to surface them. */
  initialProductDetails?: ProductDetails;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  // A flat, uncapped product list doesn't scale — GET /api/products caps
  // pageSize at 60 — so this picker searches instead of trying to load
  // everything. A product already selected but not in the current search
  // results stays selected (CheckList only drops items it isn't given), it
  // just won't be visible as a checked row until its name is searched again
  // — productDetails (below) is what keeps its *name* visible as a chip
  // either way.
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
        <Field label={t('Type', 'النوع')}>
          {(p) => (
            <Select {...p} {...register('type' as never)} disabled={busy}>
              <option value="PERCENT">{t('Percentage off', 'نسبة مئوية')}</option>
              <option value="AMOUNT">{t('Amount off ($)', 'مبلغ ثابت ($)')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('Value', 'القيمة')} error={errors.value?.message as string | undefined}>
          {(p) => (
            <Input {...p} type="number" min={0} step="0.01" {...register('value' as never, { valueAsNumber: true })} disabled={busy} />
          )}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field
          label={t('Priority', 'الأولوية')}
          hint={t(
            'Higher priority wins outright — promotions never combine.',
            'الأولوية الأعلى تفوز بالكامل — لا تتراكم العروض.'
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

      <Choice
        type="checkbox"
        label={t('Stackable with the product’s own sale', 'يتراكم مع تخفيض المنتج الخاص')}
        {...register('stackable' as never)}
        disabled={busy}
      />
      <p className="admin-form__hint">
        {t(
          'On: apply the product sale first, then this promotion off the reduced price. Off: this promotion off the original price; the product sale is ignored.',
          'مفعّل: يُطبَّق تخفيض المنتج أولاً ثم هذا العرض على السعر المخفَّض. مطفأ: هذا العرض على السعر الأصلي، ويُتجاهَل تخفيض المنتج.'
        )}
      </p>

      <div className="admin-form__row">
        <Field label={t('Starts', 'يبدأ')} hint={t('Blank = now', 'فارغ = الآن')} error={errors.startsAt?.message as string | undefined}>
          {(p) => <Input {...p} type="datetime-local" {...register('startsAt' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Ends', 'ينتهي')} hint={t('Blank = no end', 'فارغ = بلا نهاية')} error={errors.endsAt?.message as string | undefined}>
          {(p) => <Input {...p} type="datetime-local" {...register('endsAt' as never)} disabled={busy} />}
        </Field>
      </div>
    </>
  );
}

/** "Which live products would this (possibly still-unsaved) target set
 *  cover" — an on-demand check, not a live one, so it never fires a request
 *  per keystroke; the admin clicks it when they want the answer. */
export function CoveragePreviewSection({
  getValues,
  locale,
}: {
  getValues: () => PromotionFormValues;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const previewCoverage = usePreviewPromotionCoverage();

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
