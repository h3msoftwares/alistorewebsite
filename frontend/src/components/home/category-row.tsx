'use client';

import { useCategoryProducts } from '@/hooks/use-catalog';
import { accentStyle } from '@/lib/collections';
import type { Category } from '@/lib/types';
import { HorizontalScroller } from './horizontal-scroller';
import { MediaTile } from './media-tile';

const ROW_SIZE = 12;

/** One featured-category row on the home page: the category's name (linking
 *  to its page) + a horizontal scroll of its products (image + name each,
 *  linking to the product page). Independent of whether the category's own
 *  collection is also featured (see `CollectionRow`). */
export function CategoryRow({ locale, category }: { locale: string; category: Category }) {
  const isAr = locale === 'ar';
  const { data, isPending } = useCategoryProducts(category.id, { pageSize: ROW_SIZE });
  const name = isAr ? category.nameAr : category.nameEn;
  const items = data?.items ?? [];

  if (!isPending && items.length === 0) return null;

  return (
    <div data-collection={category.collection?.slug} style={accentStyle(category.collection?.accentColor)}>
      <HorizontalScroller
        locale={locale}
        title={name}
        titleHref={`/${locale}/category/${category.slug}`}
        ariaLabel={name}
      >
        {isPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="media-tile-skeleton skeleton" aria-hidden />
            ))
          : items.map((product) => (
              <MediaTile
                key={product.id}
                href={`/${locale}/product/${product.id}`}
                name={isAr ? product.nameAr : product.nameEn}
                imageUrl={product.images[0]?.url}
                imageAlt={(isAr ? product.images[0]?.altAr : product.images[0]?.altEn) ?? undefined}
              />
            ))}
      </HorizontalScroller>
    </div>
  );
}
