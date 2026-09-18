'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Alert, Button, Skeleton } from '@/components/ui';

/** Loading / error gate shared by every analytics dashboard page. */
export function DashboardState<T>({
  query,
  isAr,
  children,
}: {
  query: UseQueryResult<T>;
  isAr: boolean;
  children: (data: T) => ReactNode;
}) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  if (query.isPending) {
    return (
      <div className="analytics-grid" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="block" height="96px" />
        ))}
        <Skeleton variant="block" height="280px" style={{ gridColumn: '1 / -1' }} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert tone="danger">
        {t("Couldn't load this report.", 'تعذّر تحميل هذا التقرير.')}{' '}
        <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
          {t('Retry', 'إعادة المحاولة')}
        </Button>
      </Alert>
    );
  }
  return <>{children(query.data)}</>;
}

/** Shown where a GA4-backed widget would be when the GA4 service account is
 *  not configured. */
export function GaNotConnected({ what, isAr }: { what: string; isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  return (
    <Alert tone="info">
      {t(
        `${what} needs Google Analytics 4. Add the GA4 service-account keys to the backend env (see `,
        `يحتاج ${what} إلى Google Analytics 4. أضف مفاتيح حساب خدمة GA4 إلى بيئة الخادم (راجع `
      )}
      <code>backend/docs/ga4-setup.md</code>
      {t(').', ').')}
    </Alert>
  );
}
