'use client';

import Link from 'next/link';
import { Alert, EmptyState, Skeleton } from '@/components/ui';
import { OrderDetailCard } from '@/components/orders/order-detail-card';
import { useAuth } from '@/hooks/use-auth';
import { useCancelOrder, useOrder } from '@/hooks/use-orders';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';

export function OrderDetailView({ locale, id }: { locale: Locale; id: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { status: authStatus } = useAuth();
  const order = useOrder(authStatus === 'authenticated' ? id : undefined);
  const cancel = useCancelOrder();

  if (authStatus === 'loading' || (authStatus === 'authenticated' && order.isPending)) {
    return (
      <div className="container section--tight stack">
        <Skeleton variant="title" width="40%" />
        <Skeleton variant="block" height="16rem" />
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <div className="container section--tight">
        <Alert tone="warning">{t('Please sign in to view this order.', 'يرجى تسجيل الدخول لعرض هذا الطلب.')}</Alert>
        <p className="prose" style={{ marginBlockStart: 'var(--space-4)' }}>
          <Link className="btn btn--primary" href={`/${locale}/login?next=/${locale}/orders/${id}`}>
            {t('Sign in', 'تسجيل الدخول')}
          </Link>
        </p>
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="container section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't find that order", 'تعذّر العثور على هذا الطلب')}
          action={
            <Link className="btn btn--primary" href={`/${locale}/orders`}>
              {t('Back to my orders', 'العودة إلى طلباتي')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section--tight">
      <h1 style={{ marginBlockStart: 0 }}>{t('Order', 'الطلب')}</h1>
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <OrderDetailCard
          locale={locale}
          order={order.data}
          onCancel={() => cancel.mutate(id)}
          cancelling={cancel.isPending}
          cancelError={
            cancel.isError
              ? isApiError(cancel.error)
                ? cancel.error.message
                : t('Could not cancel the order. Try again.', 'تعذّر إلغاء الطلب. حاول مرة أخرى.')
              : null
          }
        />
      </div>
    </div>
  );
}
