'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, X, Truck, PackageCheck, Banknote, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Alert,
  Button,
  ConfirmModal,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  ProductGridSkeleton,
  RowActionsMenu,
  Select,
} from '@/components/ui';
import { useAdminReturns, useUpdateReturnStatus } from '@/hooks/use-returns';
import { useStepUp } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';
import { colorLabel } from '@/lib/product-variants';
import type { Return, ReturnStatus } from '@/lib/types';

const STATUS_FILTER_OPTIONS: { value: ReturnStatus; en: string; ar: string }[] = [
  { value: 'REQUESTED', en: 'Requested', ar: 'قيد الطلب' },
  { value: 'APPROVED', en: 'Approved', ar: 'مقبول' },
  { value: 'IN_TRANSIT', en: 'In transit', ar: 'في الطريق' },
  { value: 'RECEIVED', en: 'Received', ar: 'تم الاستلام' },
  { value: 'REFUNDED', en: 'Refunded', ar: 'تم الاسترداد' },
  { value: 'REJECTED', en: 'Rejected', ar: 'مرفوض' },
  { value: 'CANCELLED', en: 'Cancelled', ar: 'مُلغى' },
];

const RETURN_STATUS_CLASS: Record<ReturnStatus, string> = {
  REQUESTED: 'status--pending',
  APPROVED: 'status--confirmed',
  IN_TRANSIT: 'status--shipped',
  RECEIVED: 'status--delivered',
  REFUNDED: 'status--delivered',
  REJECTED: 'status--cancelled',
  CANCELLED: 'status--cancelled',
};

// Mirrors return.service.ts's LEGAL_TRANSITIONS exactly — the backend is
// still the real gate (an atomic conditional update guarded on the exact
// current status), this just decides which buttons this row shows.
const RETURN_ACTIONS: Record<
  ReturnStatus,
  { next: ReturnStatus; en: string; ar: string; icon: LucideIcon; tone?: 'danger' }[]
> = {
  REQUESTED: [
    { next: 'APPROVED', en: 'Approve', ar: 'قبول', icon: Check },
    { next: 'REJECTED', en: 'Reject', ar: 'رفض', icon: X, tone: 'danger' },
    { next: 'CANCELLED', en: 'Cancel request', ar: 'إلغاء الطلب', icon: Undo2, tone: 'danger' },
  ],
  APPROVED: [
    { next: 'IN_TRANSIT', en: 'Mark in transit', ar: 'تحديد كـ"في الطريق"', icon: Truck },
    { next: 'CANCELLED', en: 'Cancel request', ar: 'إلغاء الطلب', icon: Undo2, tone: 'danger' },
  ],
  IN_TRANSIT: [
    { next: 'RECEIVED', en: 'Mark received', ar: 'تحديد كمُستلَم', icon: PackageCheck },
    { next: 'CANCELLED', en: 'Cancel request', ar: 'إلغاء الطلب', icon: Undo2, tone: 'danger' },
  ],
  RECEIVED: [{ next: 'REFUNDED', en: 'Mark refunded', ar: 'تحديد كمُسترَد', icon: Banknote }],
  REJECTED: [],
  REFUNDED: [],
  CANCELLED: [],
};

export default function AdminReturnsPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const money = (n: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'USD',
      numberingSystem: 'latn',
    }).format(n);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const [statusFilter, setStatusFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ ret: Return; next: ReturnStatus } | null>(null);

  // Same STEP_UP_REQUIRED-retry contract as admin/orders/page.tsx's own
  // status-change action — approving/refunding a return is just as
  // sensitive (inventory + refund bookkeeping), so it carries the same
  // step-up gate on the backend and needs the identical re-prompt flow here.
  const [stepUpPrompt, setStepUpPrompt] = useState<{ id: string; fn: () => Promise<unknown>; failMsg: string } | null>(
    null
  );
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);

  const statuses = statusFilter ? ([statusFilter] as ReturnStatus[]) : undefined;
  const { data, isPending, isError, refetch } = useAdminReturns(statuses);
  const updateStatus = useUpdateReturnStatus();
  const stepUp = useStepUp();

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (id: string, fn: () => Promise<unknown>, failMsg: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      if (isApiError(e) && e.code === 'STEP_UP_REQUIRED') {
        setStepUpPrompt({ id, fn, failMsg });
      } else {
        setActionError(e instanceof Error ? e.message : failMsg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const closeStepUp = () => {
    setStepUpPrompt(null);
    setStepUpPassword('');
    setStepUpError(null);
  };

  const submitStepUp = async () => {
    if (!stepUpPrompt) return;
    setStepUpError(null);
    try {
      await stepUp.mutateAsync(stepUpPassword);
    } catch {
      setStepUpError(t('Incorrect password.', 'كلمة المرور غير صحيحة.'));
      return;
    }
    const { id, fn, failMsg } = stepUpPrompt;
    closeStepUp();
    await run(id, fn, failMsg);
  };

  const closeConfirm = () => setPending(null);

  const confirmTransition = async () => {
    if (!pending) return;
    const { ret, next } = pending;
    closeConfirm();
    await run(
      ret.id,
      () => updateStatus.mutateAsync({ id: ret.id, status: next }),
      t('Update failed', 'فشل التحديث')
    );
  };

  const rows = data ?? [];

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Returns', 'المرتجعات')}</h1>
        <label>
          <span className="visually-hidden">{t('Filter by status', 'تصفية حسب الحالة')}</span>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('All statuses', 'كل الحالات')}</option>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.en, s.ar)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {actionError && (
        <Alert tone="danger" className="stack">
          {actionError}
        </Alert>
      )}

      {isPending ? (
        <ProductGridSkeleton count={4} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load returns", 'تعذّر تحميل المرتجعات')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={statusFilter ? t('No returns with this status', 'لا مرتجعات بهذه الحالة') : t('No returns yet', 'لا توجد مرتجعات بعد')}
        />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Order', 'الطلب')}</th>
              <th>{t('Customer', 'الزبون')}</th>
              <th className="is-numeric">{t('Items', 'القطع')}</th>
              <th className="is-numeric">{t('Refund', 'الاسترداد')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th>{t('Requested', 'تاريخ الطلب')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const busy = busyId === r.id;
              const open = expandedIds.has(r.id);
              const itemCount = r.items.reduce((n, ri) => n + ri.quantity, 0);
              const actions = RETURN_ACTIONS[r.status].map((a) => ({
                label: t(a.en, a.ar),
                icon: a.icon,
                tone: a.tone,
                disabled: busy,
                onClick: () => setPending({ ret: r, next: a.next }),
              }));
              return (
                <Fragment key={r.id}>
                  <tr aria-busy={busy || undefined}>
                    <td data-label={t('Order', 'الطلب')}>
                      {r.order ? (
                        <Link href={`/${locale}/admin/orders/${r.orderID}`}>{r.order.orderNumber}</Link>
                      ) : (
                        r.orderID
                      )}
                    </td>
                    <td data-label={t('Customer', 'الزبون')}>
                      {r.order?.deliveryName}
                      <br />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' }}>
                        {r.order?.deliveryPhone}
                        {r.order?.guestEmail ? ` · ${r.order.guestEmail}` : ''}
                      </span>
                    </td>
                    <td className="is-numeric" data-label={t('Items', 'القطع')}>
                      <button type="button" className="admin-disclosure" aria-expanded={open} onClick={() => toggleExpanded(r.id)}>
                        {itemCount}
                      </button>
                    </td>
                    <td className="is-numeric" data-label={t('Refund', 'الاسترداد')}>
                      {r.refundAmount != null ? money(Number(r.refundAmount)) : '—'}
                    </td>
                    <td data-label={t('Status', 'الحالة')}>
                      <span className={`status ${RETURN_STATUS_CLASS[r.status]}`}>
                        {t(
                          STATUS_FILTER_OPTIONS.find((s) => s.value === r.status)?.en ?? r.status,
                          STATUS_FILTER_OPTIONS.find((s) => s.value === r.status)?.ar ?? r.status
                        )}
                      </span>
                    </td>
                    <td data-label={t('Requested', 'تاريخ الطلب')}>{date(r.dateCreated)}</td>
                    <td>{actions.length > 0 && <RowActionsMenu label={t('More actions', 'المزيد من الإجراءات')} actions={actions} />}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7}>
                        <ul className="checkout__lines">
                          {r.items.map((ri) => {
                            const itemVariantBits = [
                              ri.orderItem?.size,
                              ri.orderItem?.color ? colorLabel(ri.orderItem.color, locale) : null,
                            ]
                              .filter(Boolean)
                              .join(' / ');
                            return (
                              <li key={ri.id}>
                                <span>
                                  {ri.orderItem?.productName}
                                  {itemVariantBits ? ` (${itemVariantBits})` : ''} × {ri.quantity}
                                </span>
                                <span className="is-numeric">{money(Number(ri.refundAmount))}</span>
                              </li>
                            );
                          })}
                        </ul>
                        {r.reason && (
                          <p className="admin-form__hint" style={{ margin: 0 }}>
                            {t('Reason', 'السبب')}: {r.reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </DataTable>
      )}

      <ConfirmModal
        open={pending !== null}
        onClose={closeConfirm}
        onConfirm={() => void confirmTransition()}
        title={
          pending
            ? t(
                `Move return for ${pending.ret.order?.orderNumber ?? pending.ret.orderID} to ${pending.next}?`,
                `نقل مرتجع الطلب ${pending.ret.order?.orderNumber ?? pending.ret.orderID} إلى ${pending.next}؟`
              )
            : ''
        }
        body={
          pending?.next === 'RECEIVED'
            ? t('This restocks the returned quantity.', 'سيُعاد المخزون إلى الكمية المرتجعة.')
            : pending?.next === 'REJECTED' || pending?.next === 'CANCELLED'
              ? t('This cannot be undone.', 'لا يمكن التراجع عن هذا.')
              : ''
        }
        confirmLabel={t('Confirm', 'تأكيد')}
        cancelLabel={t('Keep as is', 'الإبقاء كما هو')}
        tone={pending?.next === 'REJECTED' || pending?.next === 'CANCELLED' ? 'danger' : 'default'}
      />

      {stepUpPrompt && (
        <Modal open onClose={closeStepUp} title={t('Re-enter your password', 'أعد إدخال كلمة المرور')} closeLabel={t('Close', 'إغلاق')}>
          <form
            className="admin-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void submitStepUp();
            }}
          >
            <h2 className="admin-modal__title">{t('Re-enter your password', 'أعد إدخال كلمة المرور')}</h2>
            <p className="admin-modal__body">
              {t(
                'Your session needs a fresh password check before making this change.',
                'يحتاج جلستك إلى تحقق حديث من كلمة المرور قبل إجراء هذا التغيير.'
              )}
            </p>
            <Field label={t('Password', 'كلمة المرور')}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoFocus
                  value={stepUpPassword}
                  onChange={(e) => setStepUpPassword(e.target.value)}
                  disabled={stepUp.isPending}
                />
              )}
            </Field>
            {stepUpError && <Alert tone="danger">{stepUpError}</Alert>}
            <div className="admin-modal__actions">
              <Button type="button" variant="ghost" onClick={closeStepUp} disabled={stepUp.isPending}>
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button type="submit" variant="primary" loading={stepUp.isPending} disabled={!stepUpPassword}>
                {t('Confirm', 'تأكيد')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
