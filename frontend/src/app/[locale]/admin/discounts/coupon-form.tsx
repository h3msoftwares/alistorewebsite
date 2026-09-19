'use client';

import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { Choice, Field, Input, Select } from '@/components/ui';
import type { Coupon, CouponBody } from '@/lib/types';
import { fromLocalInput, toLocalInput } from './datetime-local';

export const couponSchema = z
  .object({
    // On create: blank = the server auto-generates a unique code (see
    // coupon.service.ts); a typed value is used as-is (upper-cased server
    // side). While editing, this always holds the existing coupon's code.
    code: z
      .string()
      .trim()
      .min(2, 'At least 2 characters')
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
export type CouponFormValues = z.infer<typeof couponSchema>;

export const blankCouponValues: CouponFormValues = {
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

export function couponValuesFromExisting(c: Coupon): CouponFormValues {
  return {
    code: c.code,
    type: c.type,
    value: Number(c.value),
    isActive: c.isActive,
    startsAt: toLocalInput(c.startsAt),
    endsAt: toLocalInput(c.endsAt),
    maxRedemptions: c.maxRedemptions ?? undefined,
    maxPerCustomer: c.maxPerCustomer ?? undefined,
  };
}

export function couponBodyFromValues(form: CouponFormValues, isEditing: boolean): CouponBody {
  const trimmedCode = form.code.trim();
  return {
    // Editing always sends the (fixed) existing code. On create, an
    // admin-typed code is sent as-is; left blank, it's omitted entirely so
    // the server auto-generates a unique one.
    ...(isEditing || trimmedCode ? { code: trimmedCode } : {}),
    type: form.type,
    value: form.value,
    isActive: form.isActive,
    startsAt: fromLocalInput(form.startsAt),
    endsAt: fromLocalInput(form.endsAt),
    maxRedemptions: Number.isFinite(form.maxRedemptions) ? form.maxRedemptions : null,
    maxPerCustomer: Number.isFinite(form.maxPerCustomer) ? form.maxPerCustomer : null,
  };
}

export function CouponFormFields<T extends CouponFormValues>({
  register,
  errors,
  busy,
  locale,
  isEditing,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  busy: boolean;
  locale: 'en' | 'ar';
  isEditing: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <>
      <div className="admin-form__row">
        <Field
          label={t('Code', 'الرمز')}
          hint={
            isEditing
              ? t('Auto-generated; stored upper-cased', 'يُنشأ تلقائيًا؛ يُخزَّن بأحرف كبيرة')
              : t(
                  'Leave blank for an auto-generated code, or type your own.',
                  'اتركه فارغًا لإنشاء رمز تلقائيًا، أو أدخل رمزك الخاص.'
                )
          }
          error={errors.code?.message as string | undefined}
        >
          {(p) => (
            <Input
              {...p}
              {...register('code' as never)}
              disabled={busy || isEditing}
              placeholder={isEditing ? undefined : t('e.g. SUMMER25', 'مثال: SUMMER25')}
            />
          )}
        </Field>
      </div>

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
        <Field label={t('Starts', 'يبدأ')} hint={t('Blank = now', 'فارغ = الآن')} error={errors.startsAt?.message as string | undefined}>
          {(p) => <Input {...p} type="datetime-local" {...register('startsAt' as never)} disabled={busy} />}
        </Field>
        <Field label={t('Ends', 'ينتهي')} hint={t('Blank = no end', 'فارغ = بلا نهاية')} error={errors.endsAt?.message as string | undefined}>
          {(p) => <Input {...p} type="datetime-local" {...register('endsAt' as never)} disabled={busy} />}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field
          label={t('Total uses', 'إجمالي مرات الاستخدام')}
          hint={t('Blank = unlimited', 'فارغ = بلا حد')}
          error={errors.maxRedemptions?.message as string | undefined}
        >
          {(p) => (
            <Input {...p} type="number" min={1} step="1" {...register('maxRedemptions' as never, { valueAsNumber: true })} disabled={busy} />
          )}
        </Field>
        <Field
          label={t('Uses per customer', 'مرات لكل عميل')}
          hint={t('Blank = unlimited', 'فارغ = بلا حد')}
          error={errors.maxPerCustomer?.message as string | undefined}
        >
          {(p) => (
            <Input {...p} type="number" min={1} step="1" {...register('maxPerCustomer' as never, { valueAsNumber: true })} disabled={busy} />
          )}
        </Field>
      </div>

      <Choice type="checkbox" label={t('Active', 'مُفعَّل')} {...register('isActive' as never)} disabled={busy} />
    </>
  );
}
