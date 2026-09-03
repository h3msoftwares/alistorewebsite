'use client';

import { useNavCollections } from '@/hooks/use-catalog';
import { CollectionSection, type SectionSurface } from './collection-section';

// Alternating backgrounds so each collection block is visually separated.
const SURFACES: SectionSurface[] = ['bg', 'surface', 'tint'];

/**
 * The stack of collection blocks on the home page — one per collection the
 * owner has promoted into the nav (`showInNav`), in `sortOrder`. Each section
 * fetches its own categories.
 */
export function CollectionsShowcase({ locale }: { locale: string }) {
  const { data: collections, isPending } = useNavCollections();

  if (isPending) {
    return (
      <div className="collections-showcase">
        {SURFACES.map((surface) => (
          <section key={surface} className="collection-section" data-surface={surface}>
            <div className="container">
              <div className="skeleton skeleton--title" style={{ width: '10rem' }} aria-hidden />
              <div className="skeleton-grid" aria-hidden>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <span className="skeleton skeleton--media" aria-hidden />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (!collections || collections.length === 0) return null;

  return (
    <div className="collections-showcase">
      {collections.map((collection, i) => (
        <CollectionSection
          key={collection.id}
          locale={locale}
          collection={collection}
          surface={SURFACES[i % SURFACES.length]}
        />
      ))}
    </div>
  );
}
