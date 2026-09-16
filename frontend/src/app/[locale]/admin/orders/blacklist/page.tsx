'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  Choice,
  ConfirmModal,
  DataTable,
  EmptyState,
  Field,
  Icon,
  Input,
  ProductGridSkeleton,
  Select,
} from '@/components/ui';
import { usePermissions } from '@/lib/rbac';
import { useRowSelection } from '@/hooks/use-row-selection';
import { useBlacklist, useCreateBlacklistEntry, useDeleteBlacklistEntry } from '@/hooks/use-blacklist';

const entrySchema = z.object({
  type: z.enum(['PHONE', 'EMAIL', 'IP']),
  value: z.string().trim().min(1, 'Required').max(320),
  reason: z.string().trim().max(500),
});
type EntryForm = z.infer<typeof entrySchema>;

const BLANK: EntryForm = { type: 'PHONE', value: '', reason: '' };

/** Anti-abuse block list — checked at checkout-OTP request time and at order
 *  creation (phone/email/IP). Every route here needs orders:manage
 *  specifically, not just orders:view, so the whole page gates on it
 *  client-side too — no point rendering a form whose every request would 403. */
export default function AdminBlacklistPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManage = usePermissions().has('orders:manage');

  const { data: entries, isPending, isError, refetch } = useBlacklist();
  const create = useCreateBlacklistEntry();
  const remove = useDeleteBlacklistEntry();
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || remove.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EntryForm>({ resolver: zodResolver(entrySchema), defaultValues: BLANK });

  const onSubmit = async (form: EntryForm) => {
    setError(null);
    try {
      await create.mutateAsync({ type: form.type, value: form.value, reason: form.reason || undefined });
      reset(BLANK);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const [confirmRemove, setConfirmRemove] = useState<{ id: string; value: string }[] | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const onRemove = (id: string, value: string) => setConfirmRemove([{ id, value }]);
  const selection = useRowSelection((entries ?? []).map((e) => e.id));

  const runRemove = async () => {
    if (!confirmRemove) return;
    setConfirmBusy(true);
    try {
      await Promise.all(confirmRemove.map((e) => remove.mutateAsync(e.id)));
      selection.clear();
    } finally {
      setConfirmRemove(null);
      setConfirmBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="section--tight">
        <div className="admin-page__head">
          <h1>{t('Blacklist', 'قائمة الحظر')}</h1>
        </div>
        <EmptyState
          tone="alert"
          title={t("You don't have permission to manage the block list", 'ليست لديك صلاحية لإدارة قائمة الحظر')}
        />
      </div>
    );
  }

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Blacklist', 'قائمة الحظر')}</h1>
      </div>
      <p className="admin-form__hint">
        {t(
          'Blocks a phone number, email, or IP from checking out — checked at checkout OTP and order creation.',
          'يمنع رقم هاتف أو بريدًا إلكترونيًا أو عنوان IP من إتمام الشراء — يُتحقَّق منه عند رمز التحقق للدفع وإنشاء الطلب.'
        )}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <div className="admin-form__section">
          <p className="admin-form__section-title">{t('Block something', 'حظر عنصر')}</p>
          <div className="admin-form__row">
            <Field label={t('Type', 'النوع')}>
              {(p) => (
                <Select {...p} {...register('type')} disabled={busy}>
                  <option value="PHONE">{t('Phone', 'هاتف')}</option>
                  <option value="EMAIL">{t('Email', 'بريد إلكتروني')}</option>
                  <option value="IP">{t('IP address', 'عنوان IP')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('Value', 'القيمة')} error={errors.value?.message} required>
              {(p) => <Input {...p} {...register('value')} disabled={busy} placeholder="+96170123456" />}
            </Field>
          </div>
          <Field
            label={t('Reason (optional)', 'السبب (اختياري)')}
            hint={t('Internal note — not shown to the customer', 'ملاحظة داخلية — لا تظهر للعميل')}
          >
            {(p) => <Input {...p} {...register('reason')} disabled={busy} />}
          </Field>

          {error && <Alert tone="danger" className="stack">{error}</Alert>}

          <div className="admin-form__actions">
            <Button type="submit" loading={busy}>
              {t('Add to block list', 'إضافة إلى قائمة الحظر')}
            </Button>
          </div>
        </div>
      </form>

      {isPending ? (
        <ProductGridSkeleton count={3} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load the block list", 'تعذّر تحميل قائمة الحظر')}
          action={<Button variant="primary" onClick={() => refetch()}>{t('Retry', 'إعادة المحاولة')}</Button>}
        />
      ) : (entries ?? []).length === 0 ? (
        <EmptyState title={t('Nothing blocked yet', 'لا يوجد حظر بعد')} />
      ) : (
        <>
          {selection.count > 0 && (
            <div className="admin-bulk-bar">
              <span className="admin-bulk-bar__count">
                {t(`${selection.count} selected`, `${selection.count} محدد`)}
              </span>
              <span className="admin-bulk-bar__actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="btn--danger-quiet"
                  onClick={() => setConfirmRemove((entries ?? []).filter((e) => selection.selected.has(e.id)))}
                >
                  {t(`Remove (${selection.count})`, `إزالة (${selection.count})`)}
                </Button>
                <button type="button" className="admin-bulk-bar__clear" onClick={selection.clear}>
                  {t('Clear', 'إلغاء التحديد')}
                </button>
              </span>
            </div>
          )}

        <DataTable responsive>
          <thead>
            <tr>
              <th aria-hidden="true">
                <Choice
                  type="checkbox"
                  checked={selection.allSelected}
                  onChange={selection.toggleAll}
                  label={<span className="visually-hidden">{t('Select all', 'تحديد الكل')}</span>}
                />
              </th>
              <th>{t('Type', 'النوع')}</th>
              <th>{t('Value', 'القيمة')}</th>
              <th>{t('Reason', 'السبب')}</th>
              <th>{t('Blocked by', 'حظره')}</th>
              <th>{t('Added', 'أُضيف')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e) => (
              <tr key={e.id}>
                <td data-label={t('Select', 'تحديد')}>
                  <Choice
                    type="checkbox"
                    checked={selection.selected.has(e.id)}
                    onChange={() => selection.toggle(e.id)}
                    label={<span className="visually-hidden">{t(`Select ${e.value}`, `تحديد ${e.value}`)}</span>}
                  />
                </td>
                <td data-label={t('Type', 'النوع')}>
                  {e.type === 'PHONE' ? t('Phone', 'هاتف') : e.type === 'EMAIL' ? t('Email', 'بريد إلكتروني') : t('IP address', 'عنوان IP')}
                </td>
                <td data-label={t('Value', 'القيمة')}>{e.value}</td>
                <td data-label={t('Reason', 'السبب')}>{e.reason || '—'}</td>
                <td data-label={t('Blocked by', 'حظره')}>{e.creator?.name ?? '—'}</td>
                <td data-label={t('Added', 'أُضيف')}>{new Date(e.createdAt).toLocaleDateString()}</td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(e.id, e.value)}
                    disabled={busy}
                    aria-label={t('Remove', 'إزالة')}
                  >
                    <Icon as={Trash2} size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        </>
      )}

      <ConfirmModal
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => void runRemove()}
        title={
          confirmRemove?.length === 1
            ? t(`Remove "${confirmRemove[0].value}" from the block list?`, `إزالة "${confirmRemove[0].value}" من قائمة الحظر؟`)
            : t(`Remove ${confirmRemove?.length ?? 0} entries from the block list?`, `إزالة ${confirmRemove?.length ?? 0} عناصر من قائمة الحظر؟`)
        }
        body={t('They will be able to place orders again.', 'سيتمكنون من تقديم الطلبات مرة أخرى.')}
        confirmLabel={t('Remove', 'إزالة')}
        cancelLabel={t('Cancel', 'إلغاء')}
        tone="danger"
        loading={confirmBusy}
      />
    </div>
  );
}
