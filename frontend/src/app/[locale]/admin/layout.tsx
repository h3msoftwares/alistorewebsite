'use client';

import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
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
 *  - not signed in as STAFF/ADMIN  → redirect to /admin/login
 *  - already signed in, on /admin/login → redirect to /admin
 *  - /admin/login is exempt from the first rule (no redirect loop)
 *
 * Protected pages render nothing but a skeleton until the viewer is confirmed
 * to be an admin; the login page renders immediately for guests.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'en') || 'en';

  const onLoginPage = pathname === `/${locale}/admin/login`;
  const resolving = status === 'loading';

  useEffect(() => {
    if (resolving) return;
    if (!isAdmin && !onLoginPage) router.replace(`/${locale}/admin/login`);
    else if (isAdmin && onLoginPage) router.replace(`/${locale}/admin`);
  }, [resolving, isAdmin, onLoginPage, locale, router]);

  const shell = (content: React.ReactNode) => <div className="container">{content}</div>;

  if (onLoginPage) {
    // Guests see the form straight away; a signed-in admin is bounced to /admin.
    return isAdmin ? shell(<GuardPending />) : shell(children);
  }

  // Rest of /admin: hold the content until the viewer is a confirmed admin.
  if (resolving || !isAdmin) return shell(<GuardPending />);

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
