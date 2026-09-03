import { OffersStrip } from '@/components/chrome/offers-strip';
import { Topbar } from '@/components/chrome/topbar';

/**
 * Site chrome rendered by the root [locale] layout:
 *   1. offers strip  (rotating promo, dismissible)
 *   2. sticky topbar (logo · collection switcher · search / favourites / cart /
 *      account-or-login)
 *
 * Composition only — each piece is its own client component. The topbar reads
 * the active collection from the URL itself.
 */
export function SiteHeader({ locale }: { locale: string }) {
  return (
    <>
      <OffersStrip locale={locale} />
      <Topbar locale={locale} />
    </>
  );
}
