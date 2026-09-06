'use client';

import { useCategoryProducts } from '@/hooks/use-catalog';
import { useReveal } from '@/hooks/use-reveal';
import { accentStyle } from '@/lib/collections';
import type { Category } from '@/lib/types';
import { HorizontalScroller } from './horizontal-scroller';
import { HomeProductCard } from './home-card';

const ROW_SIZE = 12;

/** One featured-category row on the home page: the category's name (linking
 *  to its page) + a horizontal scroll of its products (image + name each,
 *  linking to the product page). Independent of whether the category's own
 *  collection is also featured (see `CollectionRow`). */
export function CategoryRow({
  locale,
  category,
  delayMs = 0,
}: {
  locale: string;
  category: Category;
  delayMs?: number;
}) {
  const isAr = locale === 'ar';
  const { data, isPending } = useCategoryProducts(category.id, { pageSize: ROW_SIZE });
  const name = isAr ? category.nameAr : category.nameEn;
  const items = data?.items ?? [];
  const [revealRef, revealClass, revealStyle] = useReveal(delayMs);

  if (!isPending && items.length === 0) return null;

  return (
    <div
      ref={revealRef}
      className={revealClass}
      data-collection={category.collection?.slug}
      style={{ ...accentStyle(category.collection?.accentColor), ...revealStyle }}
    >
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
              <HomeProductCard key={product.id} product={product} locale={isAr ? 'ar' : 'en'} />
            ))}
      </HorizontalScroller>
    </div>
  );
}
