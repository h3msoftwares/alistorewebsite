'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { Drawer } from '@/components/ui/drawer';
import { groupAdminNavItems, useAdminNavItems } from '@/hooks/use-admin-nav';
import { NotificationBell } from './notification-bell';
import { usePermissions, ADMIN_NAV_GROUP_LABEL } from '@/lib/rbac';
import { useAdminDashboard } from '@/hooks/use-orders';

const PRIMARY_KEYS = ['dashboard', '/orders', '/products'];

/**
 * Mobile stand-in for the sidebar: a bottom tab bar with the sections people
 * check on the go, plus a "More" tab that opens the full nav (every section
 * this viewer has, grouped the same way as the desktop sidebar) in the
 * existing `Drawer` component. CSS-hidden at/above the shell breakpoint.
 */
export function AdminMobileNav({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const pathname = usePathname();
  const items = useAdminNavItems(locale);
  const { has } = usePermissions();
  const { data: dashboard } = useAdminDashboard();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const primary = PRIMARY_KEYS.map((k) => items.find((i) => i.key === k)).filter((i): i is NonNullable<typeof i> => Boolean(i));
  for (const item of items) {
    if (primary.length >= 3) break;
    if (!primary.some((p) => p.key === item.key)) primary.push(item);
  }

  const flaggedCount = has('orders:view') ? dashboard?.flaggedOrders : undefined;
  const groups = groupAdminNavItems(items);

  return (
    <>
      <nav className="admin-mobile-nav" aria-label={t('Admin navigation', 'تنقل الإدارة')}>
        {primary.map((item) => (
          <Link key={item.key} href={item.href} className="admin-mobile-nav__item" data-active={item.active || undefined}>
            <span className="admin-mobile-nav__icon">
              <Icon as={item.icon} size={19} />
              {item.key === '/orders' && Boolean(flaggedCount) && <span className="admin-mobile-nav__badge">{flaggedCount}</span>}
            </span>
            {item.label}
          </Link>
        ))}
        <NotificationBell locale={isAr ? 'ar' : 'en'} variant="tab" />
        <button type="button" className="admin-mobile-nav__item" data-active={open || undefined} onClick={() => setOpen(true)}>
          <Icon as={Menu} size={19} />
          {t('More', 'المزيد')}
        </button>
      </nav>

      <Drawer open={open} onClose={() => setOpen(false)} side="start" title={t('Menu', 'القائمة')} closeLabel={t('Close', 'إغلاق')} className="admin-nav-drawer__panel">
        <nav className="admin-sidebar__nav admin-nav-drawer__nav">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="admin-sidebar__group">
              <div className="admin-sidebar__group-label">{isAr ? ADMIN_NAV_GROUP_LABEL[group].ar : ADMIN_NAV_GROUP_LABEL[group].en}</div>
              {groupItems.map((item) => (
                <Link key={item.key} href={item.href} className="admin-sidebar__link" data-active={item.active || undefined}>
                  <Icon as={item.icon} size={18} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </Drawer>
    </>
  );
}
