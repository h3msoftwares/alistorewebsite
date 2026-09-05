import { Hero } from '@/components/home/hero';
import { HomeMiddle } from '@/components/home/home-middle';

/**
 * Home page structure:
 *   1. Hero — full-bleed brand illustration; text + Discover button in the gutters
 *   2. Zone 1 (featured) — admin-picked collections + categories
 *      (Collection.showOnHome / Category.showOnHome), interleaved by
 *      sortOrder, each its own horizontally-scrollable row
 *   3. Zone 2 (more) — every other collection, same row treatment
 *
 * See `home-middle.tsx` for the data assembly.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <>
      <Hero locale={locale} />
      <HomeMiddle locale={locale} />
    </>
  );
}
