import { AdminSettingsPage } from './settings-view';

// Always auth-gated, session-dependent content (admin) — no page visitor
// ever sees a valid static shell, so it gains nothing from static
// prerendering and only costs build time. Split into this thin server
// wrapper because `dynamic` can only be exported from a Server Component,
// and the actual page is 'use client' (settings-view.tsx, unchanged).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <AdminSettingsPage />;
}
