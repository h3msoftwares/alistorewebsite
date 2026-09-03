'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, Search, ShoppingBag, User } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { Drawer } from '@/components/ui/drawer';
import { useAppSelector } from '@/store/hooks';
import { STOREFRONT_COLLECTIONS } from '@/lib/collections';

/**
 * Shared header rendered by the root [locale] layout — identical chrome on
 * every page; only the collection-switcher's active pill and the per-page
 * data-collection custom properties change. Primary nav collapses into an
 * off-canvas drawer under 768px (see globals.css). TODO: swap the text logo
 * for the uploaded brand logo once provided.
 */
export function SiteHeader({
  locale,
  activeCollection,
}: {
  locale: string;
  activeCollection?: string;
}) {
  const isAr = locale === 'ar';
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const cartCount = useAppSelector((s) => s.cart.itemCount);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="announcement-bar">
        {t('Cash on Delivery • Order now', 'التوصيل عند الاستلام • اطلب الآن')}
      </div>

      <div className="container site-header__inner">
        <button
          type="button"
          className="icon-btn site-header__menu-btn"
          aria-label={t('Open menu', 'افتح القائمة')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Icon as={Menu} />
        </button>

        <Link href={`/${locale}`} className="site-header__logo">
          Ali&apos;s Store
        </Link>

        <nav className="collection-switcher" aria-label={t('Collections', 'الأقسام')}>
          {STOREFRONT_COLLECTIONS.map((c) => (
            <Link
              key={c.slug}
              href={`/${locale}/${c.slug}`}
              className="collection-switcher__link"
              data-active={activeCollection === c.slug}
              aria-current={activeCollection === c.slug ? 'page' : undefined}
            >
              {isAr ? c.nameAr : c.nameEn}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <Link
            href={`/${locale}/account`}
            className="icon-btn"
            aria-label={t('Account', 'الحساب')}
          >
            <Icon as={User} />
          </Link>
          <button type="button" className="icon-btn" aria-label={t('Search', 'بحث')}>
            <Icon as={Search} />
          </button>
          <span className="icon-btn-wrap">
            <Link href={`/${locale}/cart`} className="icon-btn" aria-label={t('Cart', 'سلة التسوق')}>
              <Icon as={ShoppingBag} />
            </Link>
            {cartCount > 0 && (
              <span className="icon-btn__badge" aria-hidden="true">
                {cartCount}
              </span>
            )}
          </span>
          <Link
            href={isAr ? '/en' : '/ar'}
            className="icon-btn icon-btn--bordered"
            aria-label={t('Switch to Arabic', 'التغيير إلى الإنجليزية')}
            title="EN / AR"
            style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, width: 'auto', paddingInline: 'var(--space-3)' }}
          >
            {isAr ? 'EN' : 'AR'}
          </Link>
        </div>
      </div>

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        side="start"
        title={t('Menu', 'القائمة')}
        closeLabel={t('Close menu', 'إغلاق القائمة')}
      >
        <nav aria-label={t('Collections', 'الأقسام')}>
          {STOREFRONT_COLLECTIONS.map((c) => (
            <Link
              key={c.slug}
              href={`/${locale}/${c.slug}`}
              className="drawer__nav-link"
              aria-current={activeCollection === c.slug ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {isAr ? c.nameAr : c.nameEn}
            </Link>
          ))}
          <Link href={`/${locale}/account`} className="drawer__nav-link" onClick={() => setMenuOpen(false)}>
            {t('Account', 'الحساب')}
          </Link>
          <Link href={isAr ? '/en' : '/ar'} className="drawer__nav-link">
            {isAr ? 'English' : 'العربية'}
          </Link>
        </nav>
      </Drawer>
    </header>
  );
}
