import { STOREFRONT_COLLECTIONS } from '@/lib/collections';
import { CollectionSection, type SectionSurface } from './collection-section';
import { PLACEHOLDER_CATEGORIES } from './placeholder-data';

// Alternating backgrounds so each collection block is visually separated.
const SURFACES: SectionSurface[] = ['bg', 'surface', 'tint'];

/**
 * The stack of collection blocks on the home page. Structure only:
 * TODO — replace STOREFRONT_COLLECTIONS + PLACEHOLDER_CATEGORIES with
 *   const { data: collections } = useCollections();
 *   // then per collection: useCategories(collection.id)
 * (this becomes a client component, or move the fetch to the server page).
 */
export function CollectionsShowcase({ locale }: { locale: string }) {
  const isAr = locale === 'ar';

  return (
    <div className="collections-showcase">
      {STOREFRONT_COLLECTIONS.map((c, i) => (
        <CollectionSection
          key={c.slug}
          locale={locale}
          slug={c.slug}
          name={isAr ? c.nameAr : c.nameEn}
          surface={SURFACES[i % SURFACES.length]}
          categories={(PLACEHOLDER_CATEGORIES[c.slug] ?? []).map((cat) => ({
            slug: cat.slug,
            name: isAr ? cat.nameAr : cat.nameEn,
          }))}
        />
      ))}
    </div>
  );
}
