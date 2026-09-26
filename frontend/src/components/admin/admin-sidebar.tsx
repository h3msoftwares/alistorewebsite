'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Languages, PanelLeftClose, UserCog } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { initialsOf } from '@/components/chrome/topbar';
import { LogoutButton } from '@/components/chrome/logout-button';
import { useAuth } from '@/hooks/use-auth';
import { useSettings } from '@/hooks/use-settings';
import { groupAdminNavItems, useAdminNavItems } from '@/hooks/use-admin-nav';
import { swapLocalePath } from '@/lib/locale-path';
import { ADMIN_NAV_GROUP_LABEL } from '@/lib/rbac';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';

/**
 * Persistent desktop nav — replaces the old horizontal wrapping pill strip.
 * CSS-hidden below the shell breakpoint (see `.admin-sidebar` in
 * globals.css); `AdminMobileNav` takes over there. Both read the same
 * `useAdminNavItems()` so they can never show different sections.
 */
export function AdminSidebar({ locale, onCollapse }: { locale: string; onCollapse: () => void }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const pathname = usePathname();
  const otherLocale = isAr ? 'en' : 'ar';
  const otherLocaleHref = swapLocalePath(pathname ?? `/${locale}/admin`, otherLocale);
  const brandName = settings ? (isAr ? settings.brandNameAr : settings.brandNameEn) : isAr ? DEFAULT_BRAND_NAME_AR : DEFAULT_BRAND_NAME_EN;
  const groups = groupAdminNavItems(useAdminNavItems(locale));

  return (
    <aside className="admin-sidebar" aria-label={t('Admin navigation', 'تنقل الإدارة')}>
      <div className="admin-sidebar__header">
        <Link href={`/${locale}/admin`} className="admin-sidebar__brand">
          <Image src="/ali-store-A-traced.png" alt="" width={28} height={26} className="admin-sidebar__brand-mark" />
          <span>{brandName}</span>
        </Link>
        <button
          type="button"
          className="icon-btn"
          onClick={onCollapse}
          title={t('Hide sidebar', 'إخفاء الشريط الجانبي')}
          aria-label={t('Hide sidebar', 'إخفاء الشريط الجانبي')}
        >
          <Icon as={PanelLeftClose} size={18} />
        </button>
      </div>

      <nav className="admin-sidebar__nav">
        {groups.map(({ group, items }) => (
          <div key={group} className="admin-sidebar__group">
            <div className="admin-sidebar__group-label">{isAr ? ADMIN_NAV_GROUP_LABEL[group].ar : ADMIN_NAV_GROUP_LABEL[group].en}</div>
            {items.map((item) => (
              <Link key={item.key} href={item.href} className="admin-sidebar__link" data-active={item.active || undefined}>
                <Icon as={item.icon} size={18} />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {user && (
        <div className="admin-sidebar__user">
          <span className="admin-sidebar__user-avatar" aria-hidden="true">
            {initialsOf(user.name)}
          </span>
          <span className="admin-sidebar__user-info">
            <span className="admin-sidebar__user-name">{user.name}</span>
            <span className="admin-sidebar__user-role">{user.roleName || (user.role === 'ADMIN' ? t('Admin', 'مسؤول') : t('Staff', 'موظف'))}</span>
          </span>
          <Link
            href={`/${locale}/admin/profile`}
            className="admin-sidebar__profile-link"
            title={t('My profile', 'ملفي الشخصي')}
            aria-label={t('My profile', 'ملفي الشخصي')}
          >
            <Icon as={UserCog} size={16} />
          </Link>
          <Link
            href={otherLocaleHref}
            className="admin-sidebar__profile-link"
            title={t('Switch to Arabic', 'التغيير إلى الإنجليزية')}
            aria-label={t('Switch to Arabic', 'التغيير إلى الإنجليزية')}
          >
            <Icon as={Languages} size={16} />
          </Link>
          <LogoutButton locale={locale} variant="icon" />
        </div>
      )}
    </aside>
  );
}
