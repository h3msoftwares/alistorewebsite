'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { PanelLeftOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminMobileNav } from '@/components/admin/admin-mobile-nav';
import { useAuth } from '@/hooks/use-auth';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import { requiredPermissionForPath, usePermissions } from '@/lib/rbac';

// `false` on the server and on the hydration render, `true` afterwards. Auth
// state is client-only (the boot refresh in StoreProvider resolves in an
// effect), and this nested layout can hydrate *after* that effect has already
// flipped the store off "loading" — so branching on `status` during hydration
// would render a different tree than SSR did and trip a hydration mismatch.
// Gate the resolved branches on this so the first client render always matches
// the server's "checking access" skeleton, then flips once mounted.
const subscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

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
 * Beyond the coarse STAFF/ADMIN check, each page is gated on the permission
 * `requiredPermissionForPath` maps it to (see lib/rbac.tsx): a staff member
 * whose role doesn't grant it gets an in-page "no access" notice instead of
 * the page (the backend refuses the data regardless).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status, isAdmin } = useAuth();
  const { has } = usePermissions();
  const hydrated = useHydrated();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'en') || 'en';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapsed();

  const resolving = !hydrated || status === 'loading';

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

  const required = requiredPermissionForPath(pathname);
  const allowed = !required || has(required);

  return (
    <div className="admin-shell" data-sidebar-collapsed={collapsed || undefined}>
      <AdminSidebar locale={locale} onCollapse={toggleSidebar} />
      {collapsed && (
        <button
          type="button"
          className="admin-sidebar-reopen"
          onClick={toggleSidebar}
          title={t('Show sidebar', 'إظهار الشريط الجانبي')}
          aria-label={t('Show sidebar', 'إظهار الشريط الجانبي')}
        >
          <Icon as={PanelLeftOpen} size={18} />
        </button>
      )}
      <main className="admin-shell__main">
        {allowed ? (
          children
        ) : (
          <div className="section--tight">
            <EmptyState
              tone="alert"
              title={isAr ? 'لا تملك صلاحية الوصول إلى هذه الصفحة' : "You don't have access to this page"}
              body={
                isAr
                  ? 'اطلب من مسؤول أن يمنح دورك الصلاحية المطلوبة من صفحة الأدوار.'
                  : 'Ask an admin to grant your role this permission from the Roles page.'
              }
            />
          </div>
        )}
      </main>
      <AdminMobileNav locale={locale} />
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
