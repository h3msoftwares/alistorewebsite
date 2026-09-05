'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  { href: '', labelEn: 'Dashboard', labelAr: 'لوحة التحكم' },
  { href: '/collections', labelEn: 'Collections', labelAr: 'المجموعات' },
  { href: '/categories', labelEn: 'Categories', labelAr: 'الفئات' },
  { href: '/products', labelEn: 'Products', labelAr: 'المنتجات' },
  { href: '/orders', labelEn: 'Orders', labelAr: 'الطلبات' },
  { href: '/analytics', labelEn: 'Analytics', labelAr: 'التحليلات' },
  { href: '/settings', labelEn: 'Settings', labelAr: 'الإعدادات' },
];

/** Top nav strip for the whole /admin subtree — every section page renders
 *  under this via AdminLayout. */
export function AdminNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const isAr = locale === 'ar';
  const base = `/${locale}/admin`;

  return (
    <nav className="admin-nav" aria-label={isAr ? 'تنقل الإدارة' : 'Admin navigation'}>
      {SECTIONS.map((s) => {
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
