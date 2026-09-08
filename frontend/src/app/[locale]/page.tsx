import { Hero } from '@/components/home/hero';
import { HomeMiddle } from '@/components/home/home-middle';
import { StoreInfo } from '@/components/home/store-info';
import { CustomerReviews } from '@/components/home/customer-reviews';

/**
 * Home page structure:
 *   1. Hero — full-bleed brand illustration; text + Discover button in the gutters
 *   2. Zone 1 (featured) — admin-picked collections + categories
 *      (Collection.showOnHome / Category.showOnHome), interleaved by
 *      sortOrder, each its own horizontally-scrollable row
 *   3. Zone 2 (more) — every other collection, same row treatment
 *   4. Store info — admin-controlled "Visit us" block (address + hours),
 *      shown just above the footer when set
 *   5. Customer reviews — admin-uploaded review screenshots in a horizontal
 *      strip, shown under Store info when any are added
 *
 * See `home-middle.tsx` for the data assembly.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <>
      <Hero locale={locale} />
      <HomeMiddle locale={locale} />
      <StoreInfo locale={locale} />
      <CustomerReviews locale={locale} />
    </>
  );
}
