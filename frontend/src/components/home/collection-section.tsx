'use client';

import Link from 'next/link';
import { useCategories } from '@/hooks/use-catalog';
import { accentStyle } from '@/lib/collections';
import type { Collection } from '@/lib/types';
import { CategoryCard } from './category-card';

export type SectionSurface = 'bg' | 'surface' | 'tint';

/**
 * One collection block on the home page: the collection name + a grid of its
 * categories. Each block sits on its own background (`surface`) so the
 * collections read as separate, and carries the collection's accent via inline
 * `--collection-*` custom properties (see globals.css `:root` fallbacks).
 */
export function CollectionSection({
  locale,
  collection,
  surface = 'bg',
}: {
  locale: string;
  collection: Collection;
  surface?: SectionSurface;
}) {
  const isAr = locale === 'ar';
  const { data: categories } = useCategories(collection.id);
  const name = isAr ? collection.nameAr : collection.nameEn;
  const list = categories ?? [];

  return (
    <section
      className="collection-section"
      data-collection={collection.slug}
      data-surface={surface}
      style={accentStyle(collection.accentColor)}
      aria-labelledby={`col-${collection.slug}`}
    >
      <div className="container">
        <header className="collection-section__head">
          <h2 id={`col-${collection.slug}`} className="collection-section__title">
            {name}
          </h2>
          <Link href={`/${locale}/${collection.slug}`} className="collection-section__all">
            {isAr ? 'عرض الكل' : 'View all'}
          </Link>
        </header>

        {list.length > 0 && (
          <ul className="category-grid" role="list">
            {list.map((cat) => (
              <li key={cat.id}>
                <CategoryCard
                  href={`/${locale}/${collection.slug}?category=${cat.slug}`}
                  name={isAr ? cat.nameAr : cat.nameEn}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
