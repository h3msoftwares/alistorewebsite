'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_SECTIONS, usePermissions } from '@/lib/rbac';

/** Top nav strip for the whole /admin subtree — every section page renders
 *  under this via AdminLayout. Only the sections the viewer has `:view` for
 *  are shown. */
export function AdminNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const isAr = locale === 'ar';
  const base = `/${locale}/admin`;
  const { has } = usePermissions();

  const sections = ADMIN_SECTIONS.filter((s) => has(s.permission));

  return (
    <nav className="admin-nav" aria-label={isAr ? 'تنقل الإدارة' : 'Admin navigation'}>
      {sections.map((s) => {
        const href = `${base}${s.href}`;
        const active = s.href === '' ? pathname === base : pathname.startsWith(href);
        return (
          <Link key={s.href} href={href} className="admin-nav__link" data-active={active || undefined}>
            {isAr ? s.labelAr : s.labelEn}
          </Link>
        );
      })}
    </nav>
  );
}
