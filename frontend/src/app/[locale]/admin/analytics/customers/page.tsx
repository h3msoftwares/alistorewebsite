import { AnalyticsCustomersPage } from './customers-view';

// Always auth-gated, session-dependent content (admin analytics) — no page
// visitor ever sees a valid static shell, so it gains nothing from static
// prerendering and only costs build time. Split into this thin server
// wrapper because `dynamic` can only be exported from a Server Component,
// and the actual page is 'use client' (customers-view.tsx, unchanged).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <AnalyticsCustomersPage />;
}
