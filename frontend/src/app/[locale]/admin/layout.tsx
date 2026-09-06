'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminNav } from '@/components/admin/admin-nav';
import { useAuth } from '@/hooks/use-auth';

/**
 * Client-side auth guard for the whole /admin subtree.
 *
 * It has to run on the client: the refresh cookie is scoped to `/api/auth` on
 * the API origin, so neither Next middleware nor a server component ever sees
 * it. `useAuthBootstrap` (mounted in StoreProvider) turns that cookie into a
 * profile on load; this reads the resulting Redux auth state.
 *
 * A viewer who isn't a confirmed STAFF/ADMIN is sent to the storefront home,
 * NOT to the sign-in page — the admin login lives on a deliberately
 * unguessable path (`/{locale}/ali-admin-login`) and bouncing scanners there
 * would just hand them the URL. Admins reach it by knowing it.
 *
 * Protected pages render a skeleton until the viewer is confirmed to be an
 * admin.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status, isAdmin } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'en') || 'en';

  const resolving = status === 'loading';

  useEffect(() => {
    if (!resolving && !isAdmin) router.replace(`/${locale}`);
  }, [resolving, isAdmin, locale, router]);

  if (resolving || !isAdmin) {
    return (
      <div className="container">
        <GuardPending />
      </div>
    );
  }

  return (
    <div className="container admin-shell">
      <AdminNav locale={locale} />
      {children}
    </div>
  );
}

function GuardPending() {
  return (
    <div className="section" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Checking access…</span>
      <Skeleton variant="title" style={{ width: '30%', marginBottom: 'var(--space-6)' }} />
      <div className="stack">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="line" />
        ))}
      </div>
    </div>
  );
}
