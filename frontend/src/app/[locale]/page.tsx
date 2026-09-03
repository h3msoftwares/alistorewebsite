import { Hero } from '@/components/home/hero';
import { CollectionsShowcase } from '@/components/home/collections-showcase';

/**
 * Home page structure:
 *   1. Hero        — text + Discover button + image
 *   2. Collections — one block per storefront collection (name + its category
 *                    grid), each on its own background
 *
 * Structure only — see the TODOs in the child components for where the data
 * hooks (useCollections / useCategories) plug in.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <>
      <Hero locale={locale} />
      <CollectionsShowcase locale={locale} />
    </>
  );
}
