'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Badge, Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { OrderDetailCard } from '@/components/orders/order-detail-card';
import { useOrder } from '@/hooks/use-orders';

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
 * SHIPPED), which is the wrong rule for staff, who can force-cancel from any
 * status via the status dropdown already on the list page. Omitting
 * `onCancel` here isn't a missing feature — the component only ever renders
 * a cancel button when one is passed in, so this reuse carries none of that
 * risk; status changes (including admin cancel) stay on the list page, one
 * click back, where they already work correctly.
 */
export default function AdminOrderDetailPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

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
          {order.estimatedDeliveryDays != null && (
            <Badge variant="low-stock">
              {t(`~${order.estimatedDeliveryDays} day estimate`, `تقدير ~${order.estimatedDeliveryDays} يوم`)}
            </Badge>
          )}
        </div>
        {order.status === 'CANCELLED' && (
          <Alert tone="warning">{t('This order is cancelled.', 'هذا الطلب مُلغى.')}</Alert>
        )}
        <p className="admin-form__hint" style={{ margin: 0 }}>
          {t(
            'To change this order\'s status, mark payment collected, or clear its review flag, use the orders list — this page is view-only.',
            'لتغيير حالة هذا الطلب أو تحصيل الدفع أو إزالة علامة المراجعة، استخدم قائمة الطلبات — هذه الصفحة للعرض فقط.'
          )}
        </p>
      </div>

      <div className="card" style={{ padding: 'var(--space-5)', maxWidth: '40rem' }}>
        <OrderDetailCard locale={locale} order={order} />
      </div>
    </div>
  );
}
