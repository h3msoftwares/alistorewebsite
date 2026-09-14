'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_SECTIONS, usePermissions } from '@/lib/rbac';
import { useAuth } from '@/hooks/use-auth';

/** Top nav strip for the whole /admin subtree — every section page renders
 *  under this via AdminLayout. Only the sections the viewer has `:view` for
 *  are shown. */
export function AdminNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const isAr = locale === 'ar';
  const base = `/${locale}/admin`;
  const { has } = usePermissions();
  const { user } = useAuth();

  const sections = ADMIN_SECTIONS.filter((s) => has(s.permission));

  // Database backups & outgoing mail: gated on the role itself (ADMIN only),
  // not the permission system every other section uses — a STAFF account
  // can't be granted into either one, so neither is part of
  // ADMIN_SECTIONS/PERMISSION_AREAS. Two separate links, not one menu —
  // backups and the outgoing mail account share nothing but both being
  // ADMIN-only infrastructure.
  const backupHref = `${base}/backup`;
  const backupActive = pathname.startsWith(backupHref);
  const mailHref = `${base}/mail`;
  const mailActive = pathname.startsWith(mailHref);

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
      {user?.role === 'ADMIN' && (
        <Link href={backupHref} className="admin-nav__link" data-active={backupActive || undefined}>
          {isAr ? 'النسخ الاحتياطي' : 'Backups'}
        </Link>
      )}
      {user?.role === 'ADMIN' && (
        <Link href={mailHref} className="admin-nav__link" data-active={mailActive || undefined}>
          {isAr ? 'البريد الصادر' : 'Mail'}
        </Link>
      )}
    </nav>
  );
}
