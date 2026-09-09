'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Button,
  Choice,
  DataTable,
  EmptyState,
  Field,
  Input,
  ProductGridSkeleton,
  Select,
} from '@/components/ui';
import { useAdminCollections, useAdminCategories } from '@/hooks/use-catalog';
import {
  useCoupons,
  useCreateCoupon,
  useCreateDiscount,
  useDeleteCoupon,
  useDeleteDiscount,
  useDiscounts,
  useUpdateCoupon,
  useUpdateDiscount,
} from '@/hooks/use-discounts';
import type { Coupon, Discount } from '@/lib/types';

type Tab = 'discounts' | 'coupons';

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

// ---------------------------------------------------------------- discounts ----

const discountSchema = z
  .object({
    nameEn: z.string().trim().min(1, 'Required'),
    nameAr: z.string().trim().min(1, 'Required'),
    scope: z.enum(['ALL', 'COLLECTION', 'CATEGORY']),
    collectionId: z.string(),
    categoryId: z.string(),
    type: z.enum(['PERCENT', 'AMOUNT']),
    value: z.number({ message: 'Enter a number' }).positive('Must be more than 0'),
    stacking: z.enum(['STACK', 'OVERRIDE']),
    isActive: z.boolean(),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'PERCENT' && v.value > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage is 0–100' });
    }
    if (v.scope === 'COLLECTION' && !v.collectionId) {
      ctx.addIssue({ code: 'custom', path: ['collectionId'], message: 'Pick a collection' });
    }
    if (v.scope === 'CATEGORY' && !v.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Pick a category' });
    }
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Must be after the start' });
    }
  });
type DiscountForm = z.infer<typeof discountSchema>;

const BLANK_DISCOUNT: DiscountForm = {
  nameEn: '',
  nameAr: '',
  scope: 'ALL',
  collectionId: '',
  categoryId: '',
  type: 'PERCENT',
  value: 10,
  stacking: 'STACK',
  isActive: true,
  startsAt: '',
  endsAt: '',
};

function DiscountsPanel({ isAr }: { isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: discounts, isPending, isError, refetch } = useDiscounts();
  const { data: collections } = useAdminCollections({ status: 'all' });
  const { data: categories } = useAdminCategories({ status: 'all' });
  const create = useCreateDiscount();
  const update = useUpdateDiscount();
  const remove = useDeleteDiscount();

  const [editing, setEditing] = useState<Discount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const values: DiscountForm = useMemo(
    () =>
      editing
        ? {
            nameEn: editing.nameEn,
            nameAr: editing.nameAr,
            scope: editing.scope,
            collectionId: editing.collectionID ?? '',
            categoryId: editing.categoryID ?? '',
            type: editing.type,
            value: Number(editing.value),
            stacking: editing.stacking,
            isActive: editing.isActive,
            startsAt: toLocalInput(editing.startsAt),
            endsAt: toLocalInput(editing.endsAt),
          }
        : BLANK_DISCOUNT,
    [editing]
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DiscountForm>({ resolver: zodResolver(discountSchema), values });
  const scope = useWatch({ control, name: 'scope' });

  const onSubmit = async (form: DiscountForm) => {
    setError(null);
    const body = {
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      scope: form.scope,
      collectionId: form.scope === 'COLLECTION' ? form.collectionId : null,
      categoryId: form.scope === 'CATEGORY' ? form.categoryId : null,
      type: form.type,
      value: form.value,
      stacking: form.stacking,
      isActive: form.isActive,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      setEditing(null);
      reset(BLANK_DISCOUNT);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const targetLabel = (d: Discount) =>
    d.scope === 'ALL'
      ? t('All items', 'كل المنتجات')
      : d.scope === 'COLLECTION'
        ? (isAr ? d.collection?.nameAr : d.collection?.nameEn) ?? '—'
        : (isAr ? d.category?.nameAr : d.category?.nameEn) ?? '—';

  return (
    <div className="section--tight">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <div className="admin-form__section">
          <p className="admin-form__section-title">
            {editing ? t('Edit discount', 'تعديل الخصم') : t('New discount', 'خصم جديد')}
          </p>
          <div className="admin-form__row">
            <Field label={t('Name (English)', 'الاسم (إنجليزي)')} error={errors.nameEn?.message} required>
              {(p) => <Input {...p} {...register('nameEn')} disabled={busy} />}
            </Field>
            <Field label={t('Name (Arabic)', 'الاسم (عربي)')} error={errors.nameAr?.message} required>
              {(p) => <Input {...p} dir="rtl" {...register('nameAr')} disabled={busy} />}
            </Field>
          </div>

          <div className="admin-form__row">
            <Field label={t('Applies to', 'يطبَّق على')}>
              {(p) => (
                <Select {...p} {...register('scope')} disabled={busy}>
                  <option value="ALL">{t('All items', 'كل المنتجات')}</option>
                  <option value="COLLECTION">{t('A collection', 'مجموعة')}</option>
                  <option value="CATEGORY">{t('A category', 'فئة')}</option>
                </Select>
              )}
            </Field>
            {scope === 'COLLECTION' && (
              <Field label={t('Collection', 'المجموعة')} error={errors.collectionId?.message}>
                {(p) => (
                  <Select {...p} {...register('collectionId')} disabled={busy}>
                    <option value="">{t('Choose…', 'اختر…')}</option>
                    {(collections ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {isAr ? c.nameAr : c.nameEn}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {scope === 'CATEGORY' && (
              <Field label={t('Category', 'الفئة')} error={errors.categoryId?.message}>
                {(p) => (
                  <Select {...p} {...register('categoryId')} disabled={busy}>
                    <option value="">{t('Choose…', 'اختر…')}</option>
                    {(categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {isAr ? c.nameAr : c.nameEn}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>

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

          <Field
            label={t('When a product already has its own sale', 'عندما يكون للمنتج تخفيض خاص به')}
            hint={t(
              'Stack: apply the product sale first, then this discount off the reduced price. Override: this discount off the original price; the product sale is ignored.',
              'تراكمي: يُطبَّق تخفيض المنتج أولاً ثم هذا الخصم على السعر المخفَّض. استبدال: هذا الخصم على السعر الأصلي، ويُتجاهَل تخفيض المنتج.'
            )}
          >
            {(p) => (
              <Select {...p} {...register('stacking')} disabled={busy}>
                <option value="STACK">{t('Stack (add up to it)', 'تراكمي')}</option>
                <option value="OVERRIDE">{t('Override the product sale', 'استبدال تخفيض المنتج')}</option>
              </Select>
            )}
          </Field>

          <div className="admin-form__row">
            <Field label={t('Starts', 'يبدأ')} hint={t('Blank = now', 'فارغ = الآن')} error={errors.startsAt?.message}>
              {(p) => <Input {...p} type="datetime-local" {...register('startsAt')} disabled={busy} />}
            </Field>
            <Field label={t('Ends', 'ينتهي')} hint={t('Blank = no end', 'فارغ = بلا نهاية')} error={errors.endsAt?.message}>
              {(p) => <Input {...p} type="datetime-local" {...register('endsAt')} disabled={busy} />}
            </Field>
          </div>

          <Choice type="checkbox" label={t('Active', 'مُفعَّل')} {...register('isActive')} disabled={busy} />

          {error && <Alert tone="danger" className="stack">{error}</Alert>}

          <div className="admin-form__actions">
            <Button type="submit" loading={busy}>
              {editing ? t('Save changes', 'حفظ التغييرات') : t('Add discount', 'إضافة الخصم')}
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
          title={t("Couldn't load discounts", 'تعذّر تحميل الخصومات')}
          action={<Button variant="primary" onClick={() => refetch()}>{t('Retry', 'إعادة المحاولة')}</Button>}
        />
      ) : (discounts ?? []).length === 0 ? (
        <EmptyState title={t('No discounts yet', 'لا توجد خصومات بعد')} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('Applies to', 'يطبَّق على')}</th>
              <th>{t('Discount', 'الخصم')}</th>
              <th>{t('Stacking', 'التراكم')}</th>
              <th>{t('Window', 'المدة')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(discounts ?? []).map((d) => (
              <tr key={d.id}>
                <td data-label={t('Name', 'الاسم')}>{isAr ? d.nameAr : d.nameEn}</td>
                <td data-label={t('Applies to', 'يطبَّق على')}>{targetLabel(d)}</td>
                <td data-label={t('Discount', 'الخصم')}>
                  {d.type === 'PERCENT' ? `${Number(d.value)}%` : `$${Number(d.value).toFixed(2)}`}
                </td>
                <td data-label={t('Stacking', 'التراكم')}>
                  {d.stacking === 'STACK' ? t('Stack', 'تراكمي') : t('Override', 'استبدال')}
                </td>
                <td data-label={t('Window', 'المدة')}>
                  {d.startsAt || d.endsAt
                    ? `${d.startsAt ? new Date(d.startsAt).toLocaleDateString() : '…'} – ${d.endsAt ? new Date(d.endsAt).toLocaleDateString() : '…'}`
                    : t('Always', 'دائمًا')}
                </td>
                <td data-label={t('Status', 'الحالة')}>
                  {d.isActive ? t('Active', 'مُفعَّل') : t('Off', 'موقوف')}
                </td>
                <td>
                  <span className="admin-row-actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(d)} disabled={busy}>
                      {t('Edit', 'تعديل')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(t('Delete this discount?', 'حذف هذا الخصم؟'))) remove.mutate(d.id);
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
    code: z
      .string()
      .trim()
      .min(2, 'At least 2 characters')
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only'),
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
  maxRedemptions: undefined,
  // Single-use per customer by default — clear it for a multi-use / unlimited code.
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
      code: form.code,
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
          <div className="admin-form__row">
            <Field label={t('Code', 'الرمز')} hint={t('Shown to customers; stored upper-cased', 'يظهر للعملاء؛ يُخزَّن بأحرف كبيرة')} error={errors.code?.message} required>
              {(p) => <Input {...p} {...register('code')} placeholder="SUMMER20" disabled={busy || Boolean(editing)} />}
            </Field>
          </div>
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
  const [tab, setTab] = useState<Tab>('discounts');

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Discounts', 'الخصومات')}</h1>
      </div>

      <nav className="admin-nav settings-tabs" aria-label={t('Discount sections', 'أقسام الخصومات')}>
        <button
          type="button"
          className="admin-nav__link"
          data-active={tab === 'discounts' ? '' : undefined}
          aria-pressed={tab === 'discounts'}
          onClick={() => setTab('discounts')}
        >
          {t('Catalog discounts', 'خصومات الكتالوج')}
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

      {tab === 'discounts' ? <DiscountsPanel isAr={isAr} /> : <CouponsPanel isAr={isAr} />}
    </div>
  );
}
