'use client';

import { useCategories } from '@/hooks/use-catalog';
import { accentStyle } from '@/lib/collections';
import type { Collection } from '@/lib/types';
import { HorizontalScroller } from './horizontal-scroller';
import { MediaTile } from './media-tile';

/** One featured-collection row on the home page: the collection's name
 *  (linking to its page) + a horizontal scroll of its categories (image +
 *  name each, linking to the category page). Used for both the curated
 *  "featured" zone and the "rest of the collections" zone below it — they
 *  render identically, only the data feeding them differs. */
export function CollectionRow({ locale, collection }: { locale: string; collection: Collection }) {
  const isAr = locale === 'ar';
  const { data: categories, isPending } = useCategories(collection.id);
  const name = isAr ? collection.nameAr : collection.nameEn;
  const list = categories ?? [];

  if (!isPending && list.length === 0) return null;

  return (
    <div data-collection={collection.slug} style={accentStyle(collection.accentColor)}>
      <HorizontalScroller
        locale={locale}
        title={name}
        titleHref={`/${locale}/${collection.slug}`}
        ariaLabel={name}
      >
        {isPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="media-tile-skeleton skeleton" aria-hidden />
            ))
          : list.map((cat) => (
              <MediaTile
                key={cat.id}
                href={`/${locale}/category/${cat.slug}`}
                name={isAr ? cat.nameAr : cat.nameEn}
                imageUrl={cat.images[0]?.url}
                imageAlt={(isAr ? cat.images[0]?.altAr : cat.images[0]?.altEn) ?? undefined}
              />
            ))}
      </HorizontalScroller>
    </div>
  );
}
