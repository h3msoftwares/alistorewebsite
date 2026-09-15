'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Button,
  CheckList,
  Choice,
  DataTable,
  EmptyState,
  Field,
  Input,
  ProductGridSkeleton,
  Select,
} from '@/components/ui';
import { useAdminCollections, useAdminCategories, useProducts } from '@/hooks/use-catalog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { buildCategoryPaths } from '@/lib/category-path';
import {
  useCoupons,
  useCreateCoupon,
  useCreatePromotion,
  useDeleteCoupon,
  useDeletePromotion,
  usePromotions,
  useUpdateCoupon,
  useUpdatePromotion,
} from '@/hooks/use-discounts';
import type { Coupon, Promotion } from '@/lib/types';

type Tab = 'promotions' | 'coupons';

// <input type="datetime-local"> <-> ISO 8601 (what the API takes / returns).
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// --------------------------------------------------------------- promotions ----

const promotionSchema = z
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
type PromotionForm = z.infer<typeof promotionSchema>;

const BLANK_PROMOTION: PromotionForm = {
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

function PromotionsPanel({ isAr }: { isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: promotions, isPending, isError, refetch } = usePromotions();
  // A flat, uncapped product list doesn't scale — GET /api/products caps
  // pageSize at 60 — so this picker searches instead of trying to load
  // everything. A product already selected but not in the current search
  // results stays selected (CheckList only drops items it isn't given), it
  // just won't be visible as a checked row until its name is searched again.
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const { data: products } = useProducts(
    { status: 'all', pageSize: 60, search: debouncedProductSearch || undefined },
    { keepPreviousData: false }
  );
  const { data: collections } = useAdminCollections({ status: 'all' });
  const { data: categories } = useAdminCategories({ status: 'all' });
  const categoryPaths = useMemo(() => buildCategoryPaths(categories ?? [], isAr), [categories, isAr]);
  const create = useCreatePromotion();
  const update = useUpdatePromotion();
  const remove = useDeletePromotion();

  const [editing, setEditing] = useState<Promotion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const values: PromotionForm = useMemo(
    () =>
      editing
        ? {
            nameEn: editing.nameEn,
            nameAr: editing.nameAr,
            type: editing.type,
            value: Number(editing.value),
            priority: editing.priority,
            stackable: editing.stackable,
            appliesToAll: editing.appliesToAll,
            productIds: editing.products.map((p) => p.productID),
            categoryTargets: editing.categories.map((c) => ({
              categoryId: c.categoryID,
              includeDescendants: c.includeDescendants,
            })),
            collectionIds: editing.collections.map((c) => c.collectionID),
            status: editing.status,
            startsAt: toLocalInput(editing.startsAt),
            endsAt: toLocalInput(editing.endsAt),
          }
        : BLANK_PROMOTION,
    [editing]
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PromotionForm>({ resolver: zodResolver(promotionSchema), values });
  const appliesToAll = useWatch({ control, name: 'appliesToAll' });

  const onSubmit = async (form: PromotionForm) => {
    setError(null);
    const body = {
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
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      setEditing(null);
      reset(BLANK_PROMOTION);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const targetLabel = (p: Promotion) => {
    if (p.appliesToAll) return t('All items', 'كل المنتجات');
    const parts: string[] = [];
    if (p.products.length) parts.push(t(`${p.products.length} product(s)`, `${p.products.length} منتج`));
    if (p.categories.length) parts.push(t(`${p.categories.length} categor${p.categories.length === 1 ? 'y' : 'ies'}`, `${p.categories.length} فئة`));
    if (p.collections.length) parts.push(t(`${p.collections.length} collection(s)`, `${p.collections.length} مجموعة`));
    return parts.join(', ') || '—';
  };

  const statusLabel = (s: Promotion['status']) =>
    ({
      DRAFT: t('Draft', 'مسودة'),
      ACTIVE: t('Active', 'مُفعَّل'),
      PAUSED: t('Paused', 'موقوف مؤقتًا'),
      ENDED: t('Ended', 'منتهٍ'),
    })[s];

  return (
    <div className="section--tight">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <div className="admin-form__section">
          <p className="admin-form__section-title">
            {editing ? t('Edit promotion', 'تعديل العرض') : t('New promotion', 'عرض جديد')}
          </p>
          <div className="admin-form__row">
            <Field label={t('Name (English)', 'الاسم (إنجليزي)')} error={errors.nameEn?.message} required>
              {(p) => <Input {...p} {...register('nameEn')} disabled={busy} />}
            </Field>
            <Field label={t('Name (Arabic)', 'الاسم (عربي)')} error={errors.nameAr?.message} required>
              {(p) => <Input {...p} dir="rtl" {...register('nameAr')} disabled={busy} />}
            </Field>
          </div>

          <Choice
            type="checkbox"
            label={t('Applies to all items', 'يُطبَّق على كل المنتجات')}
            {...register('appliesToAll')}
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
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={t('Search products…', 'ابحث عن منتج…')}
                      disabled={busy}
                      style={{ marginBottom: 'var(--space-2)' }}
                    />
                    <Controller
                      control={control}
                      name="productIds"
                      render={({ field }) => (
                        <CheckList
                          {...p}
                          value={field.value}
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
                hint={t('Optional — each category has its own "include subcategories" toggle below', 'اختياري — لكل فئة مفتاح "شمول الفئات الفرعية" الخاص بها أدناه')}
              >
                {(p) => (
                  <Controller
                    control={control}
                    name="categoryTargets"
                    render={({ field }) => {
                      const selectedIds = field.value.map((v) => v.categoryId);
                      return (
                        <>
                          <CheckList
                            {...p}
                            value={selectedIds}
                            onChange={(ids) => {
                              const byId = new Map(field.value.map((v) => [v.categoryId, v]));
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
                          {field.value.length > 0 && (
                            <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                              {field.value.map((target) => {
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
                                        field.value.map((v) =>
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
                    name="collectionIds"
                    render={({ field }) => (
                      <CheckList
                        {...p}
                        value={field.value}
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
              {errors.appliesToAll && <Alert tone="danger">{errors.appliesToAll.message}</Alert>}
            </>
          )}

          <div className="admin-form__row">
            <Field label={t('Type', 'النوع')}>
              {(p) => (
                <Select {...p} {...register('type')} disabled={busy}>
                  <option value="PERCENT">{t('Percentage off', 'نسبة مئوية')}</option>
                  <option value="AMOUNT">{t('Amount off ($)', 'مبلغ ثابت ($)')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('Value', 'القيمة')} error={errors.value?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  step="0.01"
                  {...register('value', { valueAsNumber: true })}
                  disabled={busy}
                />
              )}
            </Field>
          </div>

          <div className="admin-form__row">
            <Field
              label={t('Priority', 'الأولوية')}
              hint={t(
                'When more than one promotion covers a product, the highest priority wins outright — promotions never combine.',
                'عند تطابق أكثر من عرض على منتج واحد، يفوز الأعلى أولويةً بالكامل — لا تتراكم العروض فيما بينها.'
              )}
              error={errors.priority?.message}
            >
              {(p) => <Input {...p} type="number" step="1" {...register('priority', { valueAsNumber: true })} disabled={busy} />}
            </Field>
            <Field label={t('Status', 'الحالة')}>
              {(p) => (
                <Select {...p} {...register('status')} disabled={busy}>
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
            {...register('stackable')}
            disabled={busy}
          />
          <p className="admin-form__hint">
            {t(
              'On: apply the product sale first, then this promotion off the reduced price. Off: this promotion off the original price; the product sale is ignored.',
              'مفعّل: يُطبَّق تخفيض المنتج أولاً ثم هذا العرض على السعر المخفَّض. مطفأ: هذا العرض على السعر الأصلي، ويُتجاهَل تخفيض المنتج.'
            )}
          </p>

          <div className="admin-form__row">
            <Field label={t('Starts', 'يبدأ')} hint={t('Blank = now', 'فارغ = الآن')} error={errors.startsAt?.message}>
              {(p) => <Input {...p} type="datetime-local" {...register('startsAt')} disabled={busy} />}
            </Field>
            <Field label={t('Ends', 'ينتهي')} hint={t('Blank = no end', 'فارغ = بلا نهاية')} error={errors.endsAt?.message}>
              {(p) => <Input {...p} type="datetime-local" {...register('endsAt')} disabled={busy} />}
            </Field>
          </div>

          {error && <Alert tone="danger" className="stack">{error}</Alert>}

          <div className="admin-form__actions">
            <Button type="submit" loading={busy}>
              {editing ? t('Save changes', 'حفظ التغييرات') : t('Add promotion', 'إضافة العرض')}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                {t('Cancel', 'إلغاء')}
              </Button>
            )}
          </div>
        </div>
      </form>

      {isPending ? (
        <ProductGridSkeleton count={3} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load promotions", 'تعذّر تحميل العروض')}
          action={<Button variant="primary" onClick={() => refetch()}>{t('Retry', 'إعادة المحاولة')}</Button>}
        />
      ) : (promotions ?? []).length === 0 ? (
        <EmptyState title={t('No promotions yet', 'لا توجد عروض بعد')} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('Applies to', 'يطبَّق على')}</th>
              <th>{t('Discount', 'الخصم')}</th>
              <th>{t('Priority', 'الأولوية')}</th>
              <th>{t('Stackable', 'يتراكم')}</th>
              <th>{t('Window', 'المدة')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(promotions ?? []).map((p) => (
              <tr key={p.id}>
                <td data-label={t('Name', 'الاسم')}>{isAr ? p.nameAr : p.nameEn}</td>
                <td data-label={t('Applies to', 'يطبَّق على')}>{targetLabel(p)}</td>
                <td data-label={t('Discount', 'الخصم')}>
                  {p.type === 'PERCENT' ? `${Number(p.value)}%` : `$${Number(p.value).toFixed(2)}`}
                </td>
                <td data-label={t('Priority', 'الأولوية')}>{p.priority}</td>
                <td data-label={t('Stackable', 'يتراكم')}>
                  {p.stackable ? t('Yes', 'نعم') : t('No', 'لا')}
                </td>
                <td data-label={t('Window', 'المدة')}>
                  {p.startsAt || p.endsAt
                    ? `${p.startsAt ? new Date(p.startsAt).toLocaleDateString() : '…'} – ${p.endsAt ? new Date(p.endsAt).toLocaleDateString() : '…'}`
                    : t('Always', 'دائمًا')}
                </td>
                <td data-label={t('Status', 'الحالة')}>{statusLabel(p.status)}</td>
                <td>
                  <span className="admin-row-actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} disabled={busy}>
                      {t('Edit', 'تعديل')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(t('Delete this promotion?', 'حذف هذا العرض؟'))) remove.mutate(p.id);
                      }}
                      disabled={busy}
                    >
                      {t('Delete', 'حذف')}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ coupons ----

const couponSchema = z
  .object({
    // Auto-generated by the server on create (see coupon.service.ts); this
    // field only ever holds an existing coupon's code while editing.
    code: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only')
      .or(z.literal('')),
    type: z.enum(['PERCENT', 'AMOUNT']),
    value: z.number({ message: 'Enter a number' }).positive('Must be more than 0'),
    isActive: z.boolean(),
    startsAt: z.string(),
    endsAt: z.string(),
    // Blank = unlimited. NaN comes from an empty <input type=number>.
    maxRedemptions: z.number().int().positive().optional().or(z.nan()),
    maxPerCustomer: z.number().int().positive().optional().or(z.nan()),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'PERCENT' && v.value > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage is 0–100' });
    }
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Must be after the start' });
    }
  });
type CouponForm = z.infer<typeof couponSchema>;

const BLANK_COUPON: CouponForm = {
  code: '',
  type: 'PERCENT',
  value: 10,
  isActive: true,
  startsAt: '',
  endsAt: '',
  // Fully single-use by default (one customer, one time) — clear either field
  // for a multi-use / unlimited code.
  maxRedemptions: 1,
  maxPerCustomer: 1,
};

function CouponsPanel({ isAr }: { isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: coupons, isPending, isError, refetch } = useCoupons();
  const create = useCreateCoupon();
  const update = useUpdateCoupon();
  const remove = useDeleteCoupon();

  const [editing, setEditing] = useState<Coupon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const values: CouponForm = useMemo(
    () =>
      editing
        ? {
            code: editing.code,
            type: editing.type,
            value: Number(editing.value),
            isActive: editing.isActive,
            startsAt: toLocalInput(editing.startsAt),
            endsAt: toLocalInput(editing.endsAt),
            maxRedemptions: editing.maxRedemptions ?? undefined,
            maxPerCustomer: editing.maxPerCustomer ?? undefined,
          }
        : BLANK_COUPON,
    [editing]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CouponForm>({ resolver: zodResolver(couponSchema), values });

  const onSubmit = async (form: CouponForm) => {
    setError(null);
    const body = {
      // Omitted on create so the server auto-generates a unique code.
      ...(editing ? { code: form.code } : {}),
      type: form.type,
      value: form.value,
      isActive: form.isActive,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      maxRedemptions: Number.isFinite(form.maxRedemptions) ? form.maxRedemptions : null,
      maxPerCustomer: Number.isFinite(form.maxPerCustomer) ? form.maxPerCustomer : null,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      setEditing(null);
      reset(BLANK_COUPON);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  return (
    <div className="section--tight">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <div className="admin-form__section">
          <p className="admin-form__section-title">
            {editing ? t('Edit coupon', 'تعديل القسيمة') : t('New coupon', 'قسيمة جديدة')}
          </p>
          {editing ? (
            <div className="admin-form__row">
              <Field label={t('Code', 'الرمز')} hint={t('Auto-generated; stored upper-cased', 'يُنشأ تلقائيًا؛ يُخزَّن بأحرف كبيرة')}>
                {(p) => <Input {...p} {...register('code')} disabled />}
              </Field>
            </div>
          ) : (
            <Alert tone="info" className="stack">
              {t(
                'A unique 12-digit code (e.g. 4821-0937-6650) will be generated automatically.',
                'سيتم إنشاء رمز فريد مكوّن من 12 رقمًا (مثل 4821-0937-6650) تلقائيًا.'
              )}
            </Alert>
          )}
          <div className="admin-form__row">
            <Field label={t('Type', 'النوع')}>
              {(p) => (
                <Select {...p} {...register('type')} disabled={busy}>
                  <option value="PERCENT">{t('Percentage off', 'نسبة مئوية')}</option>
                  <option value="AMOUNT">{t('Amount off ($)', 'مبلغ ثابت ($)')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('Value', 'القيمة')} error={errors.value?.message}>
              {(p) => (
                <Input {...p} type="number" min={0} step="0.01" {...register('value', { valueAsNumber: true })} disabled={busy} />
              )}
            </Field>
          </div>
          <div className="admin-form__row">
            <Field label={t('Starts', 'يبدأ')} hint={t('Blank = now', 'فارغ = الآن')} error={errors.startsAt?.message}>
              {(p) => <Input {...p} type="datetime-local" {...register('startsAt')} disabled={busy} />}
            </Field>
            <Field label={t('Ends', 'ينتهي')} hint={t('Blank = no end', 'فارغ = بلا نهاية')} error={errors.endsAt?.message}>
              {(p) => <Input {...p} type="datetime-local" {...register('endsAt')} disabled={busy} />}
            </Field>
          </div>
          <div className="admin-form__row">
            <Field
              label={t('Total uses', 'إجمالي مرات الاستخدام')}
              hint={t('Blank = unlimited', 'فارغ = بلا حد')}
              error={errors.maxRedemptions?.message}
            >
              {(p) => (
                <Input {...p} type="number" min={1} step="1" {...register('maxRedemptions', { valueAsNumber: true })} disabled={busy} />
              )}
            </Field>
            <Field
              label={t('Uses per customer', 'مرات لكل عميل')}
              hint={t('Blank = unlimited', 'فارغ = بلا حد')}
              error={errors.maxPerCustomer?.message}
            >
              {(p) => (
                <Input {...p} type="number" min={1} step="1" {...register('maxPerCustomer', { valueAsNumber: true })} disabled={busy} />
              )}
            </Field>
          </div>
          <Choice type="checkbox" label={t('Active', 'مُفعَّل')} {...register('isActive')} disabled={busy} />

          {error && <Alert tone="danger" className="stack">{error}</Alert>}

          <div className="admin-form__actions">
            <Button type="submit" loading={busy}>
              {editing ? t('Save changes', 'حفظ التغييرات') : t('Add coupon', 'إضافة القسيمة')}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                {t('Cancel', 'إلغاء')}
              </Button>
            )}
          </div>
        </div>
      </form>

      {isPending ? (
        <ProductGridSkeleton count={3} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load coupons", 'تعذّر تحميل القسائم')}
          action={<Button variant="primary" onClick={() => refetch()}>{t('Retry', 'إعادة المحاولة')}</Button>}
        />
      ) : (coupons ?? []).length === 0 ? (
        <EmptyState title={t('No coupons yet', 'لا توجد قسائم بعد')} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Code', 'الرمز')}</th>
              <th>{t('Discount', 'الخصم')}</th>
              <th>{t('Window', 'المدة')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(coupons ?? []).map((c) => (
              <tr key={c.id}>
                <td data-label={t('Code', 'الرمز')}>{c.code}</td>
                <td data-label={t('Discount', 'الخصم')}>
                  {c.type === 'PERCENT' ? `${Number(c.value)}%` : `$${Number(c.value).toFixed(2)}`}
                </td>
                <td data-label={t('Window', 'المدة')}>
                  {c.startsAt || c.endsAt
                    ? `${c.startsAt ? new Date(c.startsAt).toLocaleDateString() : '…'} – ${c.endsAt ? new Date(c.endsAt).toLocaleDateString() : '…'}`
                    : t('Always', 'دائمًا')}
                </td>
                <td data-label={t('Status', 'الحالة')}>
                  {c.isActive ? t('Active', 'مُفعَّل') : t('Off', 'موقوف')}
                </td>
                <td>
                  <span className="admin-row-actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)} disabled={busy}>
                      {t('Edit', 'تعديل')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(t('Delete this coupon?', 'حذف هذه القسيمة؟'))) remove.mutate(c.id);
                      }}
                      disabled={busy}
                    >
                      {t('Delete', 'حذف')}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- page ----

export default function AdminDiscountsPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const [tab, setTab] = useState<Tab>('promotions');

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Discounts', 'الخصومات')}</h1>
      </div>

      <nav className="admin-nav settings-tabs" aria-label={t('Discount sections', 'أقسام الخصومات')}>
        <button
          type="button"
          className="admin-nav__link"
          data-active={tab === 'promotions' ? '' : undefined}
          aria-pressed={tab === 'promotions'}
          onClick={() => setTab('promotions')}
        >
          {t('Promotions', 'العروض')}
        </button>
        <button
          type="button"
          className="admin-nav__link"
          data-active={tab === 'coupons' ? '' : undefined}
          aria-pressed={tab === 'coupons'}
          onClick={() => setTab('coupons')}
        >
          {t('Coupons', 'القسائم')}
        </button>
      </nav>

      {tab === 'promotions' ? <PromotionsPanel isAr={isAr} /> : <CouponsPanel isAr={isAr} />}
    </div>
  );
}
