import Link from 'next/link';

const DEPARTMENTS = [
  { slug: 'women', labelEn: 'Women', labelAr: 'حريمي' },
  { slug: 'men', labelEn: 'Men', labelAr: 'رجالي' },
  { slug: 'kids', labelEn: 'Kids', labelAr: 'أطفال' },
] as const;

/**
 * Shared header rendered by the root [locale] layout, so it's identical
 * (chrome, spacing, icons) whichever door/page you're on — only the
 * department-switcher's active pill and the CSS custom properties from
 * data-department (set per-page) change. TODO: swap the text logo for the
 * uploaded brand logo once it's provided.
 */
export function SiteHeader({ locale, activeDepartment }: { locale: string; activeDepartment?: 'women' | 'men' | 'kids' }) {
  return (
    <header className="site-header">
      <div className="announcement-bar">
        {locale === 'ar' ? 'التوصيل عند الاستلام • اطلب الآن' : 'Cash on Delivery • Order now'}
      </div>
      <div className="container site-header__inner">
        <Link href={`/${locale}`} className="site-header__logo">
          Ali&apos;s Store
        </Link>

        <nav className="department-switcher" aria-label="Departments">
          {DEPARTMENTS.map((d) => (
            <Link
              key={d.slug}
              href={`/${locale}/${d.slug}`}
              className="department-switcher__link"
              data-active={activeDepartment === d.slug}
            >
              {locale === 'ar' ? d.labelAr : d.labelEn}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <Link href={locale === 'ar' ? '/en' : '/ar'} className="icon-btn" aria-label="Switch language" title="EN / AR">
            {locale === 'ar' ? 'EN' : 'AR'}
          </Link>
          <Link href={`/${locale}/cart`} className="icon-btn" aria-label="Cart">
            🛍
          </Link>
        </div>
      </div>
    </header>
  );
}
