'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EmptyState, Skeleton } from '@/components/ui';
import { OrderDetailCard } from '@/components/orders/order-detail-card';
import { useCancelOrderByToken, useOrderByToken } from '@/hooks/use-orders';
import { useCancelReturnByToken, useRequestReturnByToken } from '@/hooks/use-returns';
import { isApiError } from '@/lib/api';
import type { CreateReturnBody } from '@/lib/types';

type Locale = 'en' | 'ar';

/** The guest tracking view — reached either from the confirmation email's
 *  link or via /orders/lookup's redirect. The token itself is the proof of
 *  access; no login involved at all. */
export function OrderTrackView({ locale, token }: { locale: Locale; token: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const order = useOrderByToken(token);
  const cancel = useCancelOrderByToken();
  const requestReturn = useRequestReturnByToken();
  const cancelReturn = useCancelReturnByToken();
  const [cancellingReturnId, setCancellingReturnId] = useState<string | null>(null);

  if (order.isPending) {
    return (
      <div className="container section--tight stack">
        <Skeleton variant="title" width="40%" />
        <Skeleton variant="block" height="16rem" />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="container section--tight">
        <EmptyState
          tone="alert"
          title={t('This tracking link is invalid or has expired', 'رابط التتبّع هذا غير صالح أو منتهي الصلاحية')}
          body={t(
            'Look up your order again with your order number and contact info.',
            'ابحث عن طلبك مجددًا باستخدام رقم الطلب وبيانات التواصل.'
          )}
          action={
            <Link className="btn btn--primary" href={`/${locale}/orders/lookup`}>
              {t('Look up my order', 'البحث عن طلبي')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section--tight">
      <h1 style={{ marginBlockStart: 0 }}>{t('Track your order', 'تتبّع طلبك')}</h1>
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <OrderDetailCard
          locale={locale}
          order={order.data}
          onCancel={() => cancel.mutate(token)}
          cancelling={cancel.isPending}
          cancelError={
            cancel.isError
              ? isApiError(cancel.error)
                ? cancel.error.message
                : t('Could not cancel the order. Try again.', 'تعذّر إلغاء الطلب. حاول مرة أخرى.')
              : null
          }
          onRequestReturn={(body: CreateReturnBody) => requestReturn.mutate({ token, body })}
          requestingReturn={requestReturn.isPending}
          requestReturnError={
            requestReturn.isError
              ? isApiError(requestReturn.error)
                ? requestReturn.error.message
                : t('Could not submit the return request. Try again.', 'تعذّر إرسال طلب الإرجاع. حاول مرة أخرى.')
              : null
          }
          onCancelReturn={(returnId) => {
            setCancellingReturnId(returnId);
            cancelReturn.mutate({ token, returnId }, { onSettled: () => setCancellingReturnId(null) });
          }}
          cancellingReturnId={cancellingReturnId}
        />
      </div>
    </div>
  );
}
