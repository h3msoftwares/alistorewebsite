'use client';

import { useFeaturedCategories, useFeaturedCollections, useOtherCollections } from '@/hooks/use-catalog';
import { CollectionRow } from './collection-row';
import { CategoryRow } from './category-row';
import type { Category, Collection } from '@/lib/types';

type FeaturedItem =
  | { kind: 'collection'; sortOrder: number; collection: Collection }
  | { kind: 'category'; sortOrder: number; category: Category };

function RowSkeleton() {
  return (
    <div className="home-row">
      <div className="container">
        <div className="skeleton skeleton--title" style={{ width: '10rem' }} aria-hidden />
        <div className="home-row__track" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="media-tile-skeleton skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Home page middle section:
 *   Zone 1 — admin-featured collections + categories (Collection.showOnHome /
 *            Category.showOnHome), interleaved into one list by sortOrder as
 *            a shared ranking key. A featured collection renders its
 *            categories; a featured category renders its products.
 *   Zone 2 — every other (non-featured) collection, same row treatment —
 *            "the rest of the collections", so nothing the owner has built
 *            out is ever hidden, just deprioritized.
 */
export function HomeMiddle({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const featuredCollections = useFeaturedCollections();
  const featuredCategories = useFeaturedCategories();
  const otherCollections = useOtherCollections();

  const zone1Pending = featuredCollections.isPending || featuredCategories.isPending;

  const zone1: FeaturedItem[] = zone1Pending
    ? []
    : [
        ...(featuredCollections.data ?? []).map(
          (collection): FeaturedItem => ({ kind: 'collection', sortOrder: collection.sortOrder, collection })
        ),
        ...(featuredCategories.data ?? []).map(
          (category): FeaturedItem => ({ kind: 'category', sortOrder: category.sortOrder, category })
        ),
      ].sort((a, b) => a.sortOrder - b.sortOrder);

  const hasZone1 = zone1Pending || zone1.length > 0;
  const otherPending = otherCollections.isPending;
  const others = otherCollections.data ?? [];

  if (!zone1Pending && !otherPending && zone1.length === 0 && others.length === 0) return null;

  return (
    <div className="home-middle">
      {hasZone1 && (
        <div className="home-zone home-zone--featured">
          {zone1Pending
            ? Array.from({ length: 2 }).map((_, i) => <RowSkeleton key={i} />)
            : zone1.map((item) =>
                item.kind === 'collection' ? (
                  <CollectionRow key={`col-${item.collection.id}`} locale={locale} collection={item.collection} />
                ) : (
                  <CategoryRow key={`cat-${item.category.id}`} locale={locale} category={item.category} />
                )
              )}
        </div>
      )}

      {(otherPending || others.length > 0) && (
        <div className="home-zone home-zone--more">
          <p className="home-zone__eyebrow container">
            {isAr ? 'المزيد لاكتشافه' : 'More to explore'}
          </p>
          {otherPending
            ? Array.from({ length: 2 }).map((_, i) => <RowSkeleton key={i} />)
            : others.map((collection) => (
                <CollectionRow key={collection.id} locale={locale} collection={collection} />
              ))}
        </div>
      )}
    </div>
  );
}
