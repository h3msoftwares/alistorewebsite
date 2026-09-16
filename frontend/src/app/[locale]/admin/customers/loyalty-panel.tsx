'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Button,
  Choice,
  ConfirmModal,
  DataTable,
  EmptyState,
  Field,
  Input,
  ProductGridSkeleton,
  Select,
} from '@/components/ui';
import {
  useCreateLoyaltyRule,
  useDeleteLoyaltyRule,
  useLoyaltyRules,
  useUpdateLoyaltyRule,
} from '@/hooks/use-loyalty';
import type { LoyaltyRule } from '@/lib/types';

const loyaltyRuleSchema = z
  .object({
    nameEn: z.string().trim().min(1, 'Required'),
    nameAr: z.string().trim().min(1, 'Required'),
    metric: z.enum(['ORDER_COUNT', 'TOTAL_SPENT']),
    threshold: z.number({ message: 'Enter a number' }).positive('Must be more than 0'),
    isActive: z.boolean(),
    rewardType: z.enum(['PERCENT', 'AMOUNT']),
    rewardValue: z.number({ message: 'Enter a number' }).positive('Must be more than 0'),
    // Blank = no expiry. NaN comes from an empty <input type=number>.
    couponValidDays: z.number().int().positive().optional().or(z.nan()),
  })
  .superRefine((v, ctx) => {
    if (v.rewardType === 'PERCENT' && v.rewardValue > 100) {
      ctx.addIssue({ code: 'custom', path: ['rewardValue'], message: 'A percentage is 0–100' });
    }
  });
type LoyaltyRuleForm = z.infer<typeof loyaltyRuleSchema>;

const BLANK_RULE: LoyaltyRuleForm = {
  nameEn: '',
  nameAr: '',
  metric: 'ORDER_COUNT',
  threshold: 5,
  isActive: true,
  rewardType: 'PERCENT',
  rewardValue: 10,
  couponValidDays: undefined,
};

/**
 * Admin CRUD for loyalty rules — "reward every N orders / $N spent",
 * repeating (milestone 2 fires at 2x the threshold, and so on — see the
 * backend LoyaltyAward doc comment). Registered customers only: a coupon is
 * auto-generated and emailed the moment a customer's order is marked
 * DELIVERED and crosses a new milestone (backend loyalty.service.ts).
 */
export function LoyaltyRulesPanel({ isAr }: { isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: rules, isPending, isError, refetch } = useLoyaltyRules();
  const create = useCreateLoyaltyRule();
  const update = useUpdateLoyaltyRule();
  const remove = useDeleteLoyaltyRule();

  const [editing, setEditing] = useState<LoyaltyRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LoyaltyRule | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const values: LoyaltyRuleForm = useMemo(
    () =>
      editing
        ? {
            nameEn: editing.nameEn,
            nameAr: editing.nameAr,
            metric: editing.metric,
            threshold: Number(editing.threshold),
            isActive: editing.isActive,
            rewardType: editing.rewardType,
            rewardValue: Number(editing.rewardValue),
            couponValidDays: editing.couponValidDays ?? undefined,
          }
        : BLANK_RULE,
    [editing]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LoyaltyRuleForm>({ resolver: zodResolver(loyaltyRuleSchema), values });

  const onSubmit = async (form: LoyaltyRuleForm) => {
    setError(null);
    const body = {
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      metric: form.metric,
      threshold: form.threshold,
      isActive: form.isActive,
      rewardType: form.rewardType,
      rewardValue: form.rewardValue,
      couponValidDays: Number.isFinite(form.couponValidDays) ? form.couponValidDays : null,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      setEditing(null);
      reset(BLANK_RULE);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const metricLabel = (r: LoyaltyRule) =>
    r.metric === 'ORDER_COUNT'
      ? t(`Every ${Number(r.threshold)} delivered orders`, `كل ${Number(r.threshold)} طلبات مُسلَّمة`)
      : t(`Every $${Number(r.threshold)} spent`, `كل ${Number(r.threshold)}$ إنفاق`);

  return (
    <div className="section--tight">
      <Alert tone="info" className="stack">
        {t(
          'Registered customers only. A rule repeats: reaching the threshold a second time pays out again, automatically — a coupon is generated and emailed the moment a customer’s order is marked Delivered and crosses a new milestone.',
          'للزبائن المسجّلين فقط. القاعدة تتكرر: الوصول إلى الحد مرة ثانية يمنح مكافأة أخرى تلقائيًا — يُنشأ رمز خصم ويُرسل بالبريد فور تحديد طلب الزبون كـ«تم التسليم» وبلوغه معلمًا جديدًا.'
        )}
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <div className="admin-form__section">
          <p className="admin-form__section-title">
            {editing ? t('Edit loyalty rule', 'تعديل قاعدة الولاء') : t('New loyalty rule', 'قاعدة ولاء جديدة')}
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
            <Field label={t('Milestone based on', 'المعلم يُحتسب على')}>
              {(p) => (
                <Select {...p} {...register('metric')} disabled={busy}>
                  <option value="ORDER_COUNT">{t('Number of delivered orders', 'عدد الطلبات المُسلَّمة')}</option>
                  <option value="TOTAL_SPENT">{t('Total amount spent ($)', 'إجمالي الإنفاق ($)')}</option>
                </Select>
              )}
            </Field>
            <Field
              label={t('Every…', 'كل…')}
              hint={t('Orders, or dollars spent', 'طلبات، أو دولارات إنفاق')}
              error={errors.threshold?.message}
            >
              {(p) => (
                <Input {...p} type="number" min={0} step="1" {...register('threshold', { valueAsNumber: true })} disabled={busy} />
              )}
            </Field>
          </div>

          <div className="admin-form__row">
            <Field label={t('Reward type', 'نوع المكافأة')}>
              {(p) => (
                <Select {...p} {...register('rewardType')} disabled={busy}>
                  <option value="PERCENT">{t('Percentage off', 'نسبة مئوية')}</option>
                  <option value="AMOUNT">{t('Amount off ($)', 'مبلغ ثابت ($)')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('Reward value', 'قيمة المكافأة')} error={errors.rewardValue?.message}>
              {(p) => (
                <Input {...p} type="number" min={0} step="0.01" {...register('rewardValue', { valueAsNumber: true })} disabled={busy} />
              )}
            </Field>
          </div>

          <div className="admin-form__row">
            <Field
              label={t('Coupon expires after', 'ينتهي رمز الخصم بعد')}
              hint={t('Days from issue; blank = no expiry', 'أيام من الإصدار؛ فارغ = بلا انتهاء')}
              error={errors.couponValidDays?.message}
            >
              {(p) => (
                <Input {...p} type="number" min={1} step="1" {...register('couponValidDays', { valueAsNumber: true })} disabled={busy} />
              )}
            </Field>
          </div>
          <Choice type="checkbox" label={t('Active', 'مُفعَّلة')} {...register('isActive')} disabled={busy} />

          {error && <Alert tone="danger" className="stack">{error}</Alert>}

          <div className="admin-form__actions">
            <Button type="submit" loading={busy}>
              {editing ? t('Save changes', 'حفظ التغييرات') : t('Add rule', 'إضافة القاعدة')}
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
          title={t("Couldn't load loyalty rules", 'تعذّر تحميل قواعد الولاء')}
          action={<Button variant="primary" onClick={() => refetch()}>{t('Retry', 'إعادة المحاولة')}</Button>}
        />
      ) : (rules ?? []).length === 0 ? (
        <EmptyState title={t('No loyalty rules yet', 'لا توجد قواعد ولاء بعد')} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Rule', 'القاعدة')}</th>
              <th>{t('Milestone', 'المعلم')}</th>
              <th>{t('Reward', 'المكافأة')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(rules ?? []).map((r) => (
              <tr key={r.id}>
                <td data-label={t('Rule', 'القاعدة')}>{isAr ? r.nameAr : r.nameEn}</td>
                <td data-label={t('Milestone', 'المعلم')}>{metricLabel(r)}</td>
                <td data-label={t('Reward', 'المكافأة')}>
                  {r.rewardType === 'PERCENT' ? `${Number(r.rewardValue)}%` : `$${Number(r.rewardValue).toFixed(2)}`}
                  {' off'}
                </td>
                <td data-label={t('Status', 'الحالة')}>
                  {r.isActive ? t('Active', 'مُفعَّلة') : t('Off', 'موقوفة')}
                </td>
                <td>
                  <span className="admin-row-actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)} disabled={busy}>
                      {t('Edit', 'تعديل')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(r)}
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

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title={t('Delete this loyalty rule?', 'حذف قاعدة الولاء هذه؟')}
        body={t('This cannot be undone.', 'لا يمكن التراجع عن هذا.')}
        confirmLabel={t('Delete', 'حذف')}
        cancelLabel={t('Cancel', 'إلغاء')}
        tone="danger"
        loading={remove.isPending}
      />
    </div>
  );
}
