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
 *  root category is also featured (see `CollectionRow`, which now renders
 *  top-level categories — see the Stage 1 catalog redesign's nav/banner
 *  decision). Themed with its root ancestor's accent colour. */
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
  let root = category;
  while (root.parent) root = root.parent;

  if (!isPending && items.length === 0) return null;

  return (
    <div
      ref={revealRef}
      className={revealClass}
      data-collection={root.slug}
      style={{ ...accentStyle(root.accentColor), ...revealStyle }}
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
