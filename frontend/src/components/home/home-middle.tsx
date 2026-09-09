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
import { CollectionBanner } from './collection-banner';
import { CategoryRow } from './category-row';
import { ShowcaseRow } from './showcase-row';
import type { Category, Collection, HomeShowcase } from '@/lib/types';

type FeaturedItem =
  | { kind: 'collection'; sortOrder: number; collection: Collection }
  | { kind: 'category'; sortOrder: number; category: Category }
  | { kind: 'imageCollection'; sortOrder: number; collection: Collection }
  | { kind: 'showcase'; sortOrder: number; showcase: HomeShowcase };

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
 *   Zone 1 — everything the owner has curated onto the home page, interleaved
 *            into one list by `sortOrder` as a shared ranking key:
 *              • featured collections (Collection.showOnHome) — a row of their
 *                categories;
 *              • featured categories (Category.showOnHome) — a row of their
 *                products;
 *              • image collections (Collection.showOnHomeAsImage) — a full-width
 *                banner (coloured panel + CTA, and the photo);
 *              • built-in smart rows (best sellers / new / on sale) that are
 *                switched on.
 *   Zone 2 — every other (non-featured) collection, same row treatment —
 *            "the rest", so nothing is hidden, just deprioritized.
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

  const activeShowcases = (settings?.showcases ?? [])
    .filter((s) => s.isActive)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const zone1Pending =
    featuredCollections.isPending || featuredCategories.isPending || imageCollections.isPending;

  // One shared ranking key for every home block: `homeSortOrder` on
  // collections & categories, `sortOrder` on the smart rows.
  const zone1: FeaturedItem[] = zone1Pending
    ? []
    : [
        ...(featuredCollections.data ?? []).map(
          (collection): FeaturedItem => ({
            kind: 'collection',
            sortOrder: collection.homeSortOrder,
            collection,
          })
        ),
        ...(featuredCategories.data ?? []).map(
          (category): FeaturedItem => ({ kind: 'category', sortOrder: category.homeSortOrder, category })
        ),
        ...(imageCollections.data ?? []).map(
          (collection): FeaturedItem => ({
            kind: 'imageCollection',
            sortOrder: collection.homeSortOrder,
            collection,
          })
        ),
        ...activeShowcases.map(
          (showcase): FeaturedItem => ({ kind: 'showcase', sortOrder: showcase.sortOrder, showcase })
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
            : zone1.map((item, i) => {
                const delayMs = Math.min(i, 3) * 80;
                if (item.kind === 'collection') {
                  return (
                    <CollectionRow
                      key={`col-${item.collection.id}`}
                      locale={locale}
                      collection={item.collection}
                      delayMs={delayMs}
                    />
                  );
                }
                if (item.kind === 'category') {
                  return (
                    <CategoryRow
                      key={`cat-${item.category.id}`}
                      locale={locale}
                      category={item.category}
                      delayMs={delayMs}
                    />
                  );
                }
                if (item.kind === 'imageCollection') {
                  return (
                    <CollectionBanner
                      key={`img-${item.collection.id}`}
                      locale={locale}
                      collection={item.collection}
                      delayMs={delayMs}
                    />
                  );
                }
                return (
                  <ShowcaseRow
                    key={`show-${item.showcase.type}`}
                    locale={locale}
                    showcase={item.showcase}
                    delayMs={delayMs}
                  />
                );
              })}
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
