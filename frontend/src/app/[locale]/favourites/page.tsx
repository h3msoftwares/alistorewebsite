import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: grid of hearted products. Read ids from the `favourites` slice, fetch
// each product via useProduct(), reuse <ProductCard>. Empty state when none.
export default async function FavouritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'المفضّلة' : 'Favourites'} />;
}
