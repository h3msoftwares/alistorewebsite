'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Alert, Button, Skeleton } from '@/components/ui';

/** Loading / error gate shared by every analytics dashboard page. */
export function DashboardState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
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
        Couldn&apos;t load this report.{' '}
        <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
          Retry
        </Button>
      </Alert>
    );
  }
  return <>{children(query.data)}</>;
}

/** Shown where a GA4-backed widget would be when the GA4 service account is
 *  not configured. */
export function GaNotConnected({ what = 'This widget' }: { what?: string }) {
  return (
    <Alert tone="info">
      {what} needs Google Analytics 4. Add the GA4 service-account keys to the
      backend env (see <code>backend/docs/ga4-setup.md</code>).
    </Alert>
  );
}
