'use client';

import Link from 'next/link';
import { Alert, EmptyState, Skeleton, StatusPill } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useMyOrders } from '@/hooks/use-orders';
import { formatCurrency } from '@/lib/format';

type Locale = 'en' | 'ar';

export function OrdersView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const money = (n: number) => formatCurrency(n, locale);

  const { status: authStatus } = useAuth();
  const orders = useMyOrders({ enabled: authStatus === 'authenticated' });

  if (authStatus === 'loading') {
    return (
      <div className="container section">
        <Skeleton variant="title" width="30%" />
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <div className="container section">
        <h1>{t('My orders', 'طلباتي')}</h1>
        <Alert tone="warning">{t('Please sign in to view your orders.', 'يرجى تسجيل الدخول لعرض طلباتك.')}</Alert>
        <p className="prose" style={{ marginBlockStart: 'var(--space-4)' }}>
          <Link className="btn btn--primary" href={`/${locale}/login?next=/${locale}/orders`}>
            {t('Sign in', 'تسجيل الدخول')}
          </Link>
        </p>
        <p className="prose" style={{ marginBlockStart: 'var(--space-3)' }}>
          {t('Checking out as a guest?', 'أتممت الطلب كزائر؟')}{' '}
          <Link href={`/${locale}/orders/lookup`}>{t('Track your order instead', 'تتبّع طلبك بدلاً من ذلك')}</Link>
        </p>
      </div>
    );
  }

  if (orders.isPending) {
    return (
      <div className="container section stack">
        <h1>{t('My orders', 'طلباتي')}</h1>
        <Skeleton variant="block" height="4rem" />
        <Skeleton variant="block" height="4rem" />
      </div>
    );
  }

  if (orders.isError) {
    return (
      <div className="container section">
        <h1>{t('My orders', 'طلباتي')}</h1>
        <Alert tone="danger">{t("Couldn't load your orders.", 'تعذّر تحميل طلباتك.')}</Alert>
      </div>
    );
  }

  if (orders.data.length === 0) {
    return (
      <div className="container section">
        <h1>{t('My orders', 'طلباتي')}</h1>
        <EmptyState
          title={t('No orders yet', 'لا توجد طلبات بعد')}
          action={
            <Link className="btn btn--primary" href={`/${locale}`}>
              {t('Browse the store', 'تصفح المتجر')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section">
      <h1>{t('My orders', 'طلباتي')}</h1>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, marginBlockStart: 'var(--space-5)' }}>
        {orders.data.map((o) => (
          <li key={o.id}>
            <Link
              href={`/${locale}/orders/${o.id}`}
              className="card"
              style={{ display: 'block', padding: 'var(--space-4)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <div>
                  <strong>{o.orderNumber}</strong>
                  <div className="prose" style={{ fontSize: 'var(--fs-sm)' }}>
                    {new Date(o.dateCreated).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
                <div style={{ textAlign: 'end' }}>
                  <div className="is-numeric">{money(Number(o.total))}</div>
                  <StatusPill status={o.status} locale={locale} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
