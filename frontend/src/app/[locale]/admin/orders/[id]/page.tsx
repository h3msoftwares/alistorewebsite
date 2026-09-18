'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Alert, Badge, Button, EmptyState, Icon, ProductGridSkeleton, Select } from '@/components/ui';
import { OrderActionModals } from '@/components/orders/order-action-modals';
import { OrderDetailCard } from '@/components/orders/order-detail-card';
import { useOrder } from '@/hooks/use-orders';
import { ORDER_STATUSES, useOrderActions } from '@/hooks/use-order-actions';
import { useOrderReceiptPrint } from '@/hooks/use-order-receipt-print';
import { usePrintPreferences } from '@/hooks/use-print-preferences';
import { useSettings } from '@/hooks/use-settings';
import { useAdminRequestReturn } from '@/hooks/use-returns';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';
import type { CreateReturnBody, OrderStatus } from '@/lib/types';

/**
 * The admin-side order detail view (fix-list.md #4, resolves 2.2). Before
 * this page existed, the admin orders list showed only an item *count* per
 * row, with no way anywhere in the panel to see which products/variants/
 * quantities a given order actually contains.
 *
 * Reuses <OrderDetailCard> (the same items/delivery/total layout the
 * customer-facing /orders/[id] and guest tracking pages use) but — on
 * purpose — never passes it an `onCancel`. That component's cancel button is
 * gated by `CANCELLABLE_STATUSES` (the customer/guest rule: only before
 * SHIPPED), which is the wrong rule for staff. Instead, this page has its
 * own Actions panel (status <Select>, mark collected/unpaid, mark reviewed,
 * print receipt) built on the same `useOrderActions`/`useOrderReceiptPrint`
 * hooks the Orders list uses, so an admin can cancel from any status — or
 * take any other action — without leaving this page. It does pass
 * `onRequestReturn` (staff-initiated returns, e.g. a phone order the
 * customer can't self-serve online) — routed through `oa.run` so a
 * STEP_UP_REQUIRED response reuses the same re-auth modal as the other
 * actions here, instead of a second hand-rolled prompt.
 */
export default function AdminOrderDetailPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: settings } = useSettings();
  const brandName = settings ? (isAr ? settings.brandNameAr : settings.brandNameEn) : isAr ? DEFAULT_BRAND_NAME_AR : DEFAULT_BRAND_NAME_EN;
  const { receiptFormat, printerName } = usePrintPreferences();
  const { print: printReceipt, receiptNode } = useOrderReceiptPrint(receiptFormat, brandName, locale);
  const adminRequestReturn = useAdminRequestReturn();
  const oa = useOrderActions({
    statusChangeFailed: t('Status change failed', 'فشل تغيير الحالة'),
    updateFailed: t('Update failed', 'فشل التحديث'),
    daysRangeError: t('Enter a whole number of days (0–90), or leave blank.', 'أدخل عدد أيام صحيح (0–90)، أو اتركه فارغًا.'),
    incorrectPassword: t('Incorrect password.', 'كلمة المرور غير صحيحة.'),
  });

  const { data: order, isPending, isError, refetch } = useOrder(id);

  if (isPending) {
    return (
      <div className="section--tight">
        <ProductGridSkeleton count={1} />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't load this order", 'تعذّر تحميل هذا الطلب')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{order.orderNumber}</h1>
        <Link href={`/${locale}/admin/orders`} className="btn btn--outline">
          {t('← Back to orders', '← العودة إلى الطلبات')}
        </Link>
      </div>

      <div className="admin-form stack" style={{ marginBlockEnd: 'var(--space-5)' }}>
        <div className="admin-row-actions">
          <Badge variant={order.paymentStatus === 'COLLECTED' ? 'new' : 'low-stock'}>
            {order.paymentMethod} · {order.paymentStatus}
          </Badge>
          {order.flaggedForReview && (
            <Badge variant="sale">
              {t('Flagged', 'معلَّم')}
              {order.flaggedReason ? ` — ${order.flaggedReason}` : ''}
            </Badge>
          )}
        </div>
        {order.status === 'CANCELLED' && (
          <Alert tone="warning">{t('This order is cancelled.', 'هذا الطلب مُلغى.')}</Alert>
        )}
        {oa.actionError && <Alert tone="danger">{oa.actionError}</Alert>}

        <div className="admin-form__section">
          <p className="admin-form__section-title">{t('Actions', 'الإجراءات')}</p>
          <div className="admin-row-actions">
            <label>
              <span className="visually-hidden">{t(`Change status for ${order.orderNumber}`, `تغيير حالة ${order.orderNumber}`)}</span>
              <Select
                value={order.status}
                disabled={oa.busyId === order.id}
                onChange={(e) => oa.changeStatus(order, e.target.value as OrderStatus)}
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </label>
            {order.estimatedDeliveryDays != null && (
              <button
                type="button"
                className="admin-order-eta"
                onClick={() => oa.openDaysModal(order, 'edit')}
                disabled={oa.busyId === order.id}
                title={t('Edit the delivery estimate', 'تعديل مدة التوصيل')}
              >
                {t(`~${order.estimatedDeliveryDays}d`, `~${order.estimatedDeliveryDays} يوم`)}
              </button>
            )}
            {order.paymentMethod === 'COD' && order.paymentStatus !== 'REFUNDED' && (
              <Button
                variant="outline"
                size="sm"
                disabled={oa.busyId === order.id}
                onClick={() => oa.toggleCollected(order, order.paymentStatus !== 'COLLECTED')}
              >
                {order.paymentStatus === 'COLLECTED' ? t('Mark unpaid', 'إلغاء التحصيل') : t('Mark collected', 'تم التحصيل')}
              </Button>
            )}
            {order.paymentMethod === 'COD' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => printReceipt(order)}
                title={
                  printerName
                    ? t(`Print a delivery receipt — select "${printerName}" in the dialog`, `طباعة إيصال توصيل — اختر "${printerName}" من نافذة الطباعة`)
                    : t('Print a delivery receipt to give the customer', 'طباعة إيصال توصيل لتسليمه للزبون')
                }
              >
                <Icon as={Printer} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Print receipt', 'طباعة الإيصال')}
              </Button>
            )}
            {order.flaggedForReview && (
              <Button variant="outline" size="sm" disabled={oa.busyId === order.id} onClick={() => oa.markReviewed(order)}>
                {t('Mark reviewed', 'وضع علامة كمُراجَع')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <OrderActionModals locale={locale} oa={oa} />
      {receiptNode}

      <div className="card" style={{ padding: 'var(--space-5)', maxWidth: '40rem' }}>
        <OrderDetailCard
          locale={locale}
          order={order}
          onRequestReturn={(body: CreateReturnBody) =>
            oa.run(
              order.id,
              () => adminRequestReturn.mutateAsync({ orderId: order.id, body }),
              t('Could not submit the return request. Try again.', 'تعذّر إرسال طلب الإرجاع. حاول مرة أخرى.')
            )
          }
          requestingReturn={oa.busyId === order.id}
          requestReturnError={oa.actionError}
        />
      </div>
    </div>
  );
}
