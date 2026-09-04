import { FavouritesView } from './favourites-view';

// Grid of hearted products. Logged-in → GET /api/favourites (source of truth);
// guests → the `favourites` Redux slice + localStorage, hydrated per-id via the
// catalog endpoint. Branching lives in useFavourites(). Server shell mirrors
// app/[locale]/cart.
export default async function FavouritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <FavouritesView locale={locale} />;
}
