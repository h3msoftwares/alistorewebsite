'use client';

import {
  useFeaturedCategories,
  useFeaturedCollections,
  useHomeImageCollections,
  useOtherCollections,
} from '@/hooks/use-catalog';
import { useSettings } from '@/hooks/use-settings';
import { useReveal } from '@/hooks/use-reveal';
import { CollectionRow } from './collection-row';
import { CollectionSquare } from './collection-square';
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
  const [moreEyebrowRef, moreEyebrowClass, moreEyebrowStyle] = useReveal();
  const imageCollections = useHomeImageCollections();
  const featuredCollections = useFeaturedCollections();
  const featuredCategories = useFeaturedCategories();
  const otherCollections = useOtherCollections();
  const { data: settings } = useSettings();
  const moreHeading = settings
    ? isAr
      ? settings.homeMoreHeadingAr
      : settings.homeMoreHeadingEn
    : isAr
      ? 'المزيد لاكتشافه'
      : 'More to explore';

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
  const imagePending = imageCollections.isPending;
  const images = imageCollections.data ?? [];
  const hasImageGrid = imagePending || images.length > 0;

  if (
    !zone1Pending &&
    !otherPending &&
    !imagePending &&
    zone1.length === 0 &&
    others.length === 0 &&
    images.length === 0
  )
    return null;

  return (
    <div className="home-middle">
      {hasImageGrid && (
        <div className="home-zone home-zone--image-grid">
          <div className="home-image-grid">
            {imagePending
              ? Array.from({ length: 2 }).map((_, i) => (
                  <span key={i} className="home-square skeleton" aria-hidden />
                ))
              : images.map((collection, i) => (
                  <CollectionSquare key={collection.id} locale={locale} collection={collection} delayMs={i * 80} />
                ))}
          </div>
        </div>
      )}

      {hasZone1 && (
        <div className="home-zone home-zone--featured">
          {zone1Pending
            ? Array.from({ length: 2 }).map((_, i) => <RowSkeleton key={i} />)
            : zone1.map((item, i) =>
                item.kind === 'collection' ? (
                  <CollectionRow
                    key={`col-${item.collection.id}`}
                    locale={locale}
                    collection={item.collection}
                    delayMs={Math.min(i, 3) * 80}
                  />
                ) : (
                  <CategoryRow
                    key={`cat-${item.category.id}`}
                    locale={locale}
                    category={item.category}
                    delayMs={Math.min(i, 3) * 80}
                  />
                )
              )}
        </div>
      )}

      {(otherPending || others.length > 0) && (
        <div className="home-zone home-zone--more">
          <p
            ref={moreEyebrowRef}
            className={`home-zone__eyebrow container ${moreEyebrowClass}`}
            style={moreEyebrowStyle}
          >
            {moreHeading}
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
