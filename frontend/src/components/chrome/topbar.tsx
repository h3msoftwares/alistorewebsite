'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Menu, Search, ShoppingBag, User } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { Drawer } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui';
import { useAppSelector } from '@/store/hooks';
import { selectCartCount } from '@/store/slices/cartSlice';
import { selectFavouritesCount } from '@/store/slices/favouritesSlice';
import { useAuth } from '@/hooks/use-auth';
import { useNavCollections } from '@/hooks/use-catalog';
import { useSettings } from '@/hooks/use-settings';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';
import { SearchOverlay } from './search-overlay';
import { CartDrawer } from './cart-drawer';
import { FavouritesDrawer } from './favourites-drawer';
import { LogoutButton } from './logout-button';

// `false` on the server + the hydration render, `true` afterwards — the root
// auth bootstrap can flip the store to "authenticated" before this island
// hydrates, so gate any authed-only markup on this to avoid a mismatch.
const subscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

/** "Mohammad Ali" → "MA"; one word → its first two letters. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The sticky topbar: hamburger (mobile) · logo · collection switcher · actions.
 * The switcher is the owner-curated set of collections (`showInNav`, ordered by
 * `sortOrder`). Actions: search, favourites, cart, and account-or-login — the
 * account action becomes an initials avatar once the shopper is signed in.
 */
export function Topbar({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const cartCount = useAppSelector(selectCartCount);
  const favCount = useAppSelector(selectFavouritesCount);
  const { user, isAuthenticated } = useAuth();
  const signedIn = useHydrated() && isAuthenticated;

  const { data: navCollections, isPending: navPending } = useNavCollections();
  const { data: settings } = useSettings();
  const brandName = settings
    ? isAr
      ? settings.brandNameAr
      : settings.brandNameEn
    : isAr
      ? DEFAULT_BRAND_NAME_AR
      : DEFAULT_BRAND_NAME_EN;
  const pathname = usePathname();
  const activeSlug = pathname?.split('/')[2];

  // The home page's first screenful is a near-black band; while the sticky
  // header sits over it, it borrows that colour so it reads as part of the
  // page. Seed from the route (dark from first paint, no flash) then let the
  // scroll listener drop it once the header clears the hero.
  const isHome = pathname === `/${locale}`;
  const [onDark, setOnDark] = useState(isHome);

  useEffect(() => {
    const HEADER_PX = 72; // --header-height
    const sync = () => {
      setScrolled(window.scrollY > 4);
      const hero = document.querySelector<HTMLElement>('[data-home-hero]');
      setOnDark(!!hero && hero.getBoundingClientRect().bottom > HEADER_PX);
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [pathname]);

  const accountHref = signedIn ? `/${locale}/account` : `/${locale}/login`;

  return (
    <header className="site-header topbar" data-scrolled={scrolled} data-on-dark={onDark}>
      <div className="container topbar__inner">
        <button
          type="button"
          className="icon-btn topbar__menu-btn"
          aria-label={t('Open menu', 'افتح القائمة')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Icon as={Menu} />
        </button>

        <Link href={`/${locale}`} className="site-header__logo topbar__logo">
          {brandName}
        </Link>

        <nav className="collection-switcher topbar__nav" aria-label={t('Collections', 'الأقسام')}>
          {navPending
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="collection-switcher__link" style={{ width: '4.5rem' }} />
              ))
            : (navCollections ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={`/${locale}/${c.slug}`}
                  className="collection-switcher__link"
                  data-active={activeSlug === c.slug}
                  aria-current={activeSlug === c.slug ? 'page' : undefined}
                >
                  {isAr ? c.nameAr : c.nameEn}
                </Link>
              ))}
        </nav>

        {/* On small screens only search + cart stay here; favourites, account
            and the language switch are reachable from the menu drawer. */}
        <div className="topbar__actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={t('Search', 'بحث')}
            onClick={() => setSearchOpen(true)}
          >
            <Icon as={Search} />
          </button>

          <span className="icon-btn-wrap">
            <button
              type="button"
              className="icon-btn"
              aria-label={t('Cart', 'سلة التسوق')}
              aria-expanded={cartOpen}
              onClick={() => setCartOpen(true)}
            >
              <Icon as={ShoppingBag} />
            </button>
            {cartCount > 0 && (
              <span className="icon-btn__badge" aria-hidden="true">
                {cartCount}
              </span>
            )}
          </span>

          <span className="icon-btn-wrap topbar__fav">
            <button
              type="button"
              className="icon-btn"
              aria-label={t('Favourites', 'المفضّلة')}
              aria-expanded={favOpen}
              onClick={() => setFavOpen(true)}
            >
              <Icon as={Heart} />
            </button>
            {favCount > 0 && (
              <span className="icon-btn__badge" aria-hidden="true">
                {favCount}
              </span>
            )}
          </span>

          {signedIn ? (
            <Link
              href={`/${locale}/account`}
              className="icon-btn topbar__account topbar__account--avatar"
              aria-label={t('Account', 'الحساب')}
            >
              <span className="topbar__avatar" aria-hidden="true">
                {initialsOf(user?.name)}
              </span>
            </Link>
          ) : (
            <Link
              href={`/${locale}/login`}
              className="icon-btn topbar__account"
              aria-label={t('Log in', 'تسجيل الدخول')}
            >
              <Icon as={User} />
              <span className="topbar__account-label">{t('Log in', 'دخول')}</span>
            </Link>
          )}
        </div>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} locale={locale} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} locale={locale} />
      <FavouritesDrawer open={favOpen} onClose={() => setFavOpen(false)} locale={locale} />

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        side="start"
        title={t('Menu', 'القائمة')}
        closeLabel={t('Close menu', 'إغلاق القائمة')}
      >
        <nav className="drawer__nav" aria-label={t('Collections', 'الأقسام')}>
          {(navCollections ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/${locale}/${c.slug}`}
              className="drawer__nav-link"
              aria-current={activeSlug === c.slug ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {isAr ? c.nameAr : c.nameEn}
            </Link>
          ))}
          <hr className="drawer__divider" />
          <Link href={`/${locale}/favourites`} className="drawer__nav-link" onClick={() => setMenuOpen(false)}>
            {t('Favourites', 'المفضّلة')}
          </Link>
          <Link href={accountHref} className="drawer__nav-link" onClick={() => setMenuOpen(false)}>
            {signedIn ? t('Account', 'الحساب') : t('Log in', 'تسجيل الدخول')}
          </Link>
          <Link
            href={isAr ? '/en' : '/ar'}
            className="drawer__nav-link"
            aria-label={t('Switch to Arabic', 'التغيير إلى الإنجليزية')}
          >
            {isAr ? 'English' : 'العربية'}
          </Link>
          {signedIn && <LogoutButton locale={locale} variant="nav" onDone={() => setMenuOpen(false)} />}
        </nav>
      </Drawer>
    </header>
  );
}
