'use client';

import { useProducts } from '@/hooks/use-catalog';
import { useReveal } from '@/hooks/use-reveal';
import type { HomeShowcase, ProductListQuery, ShowcaseType } from '@/lib/types';
import { HorizontalScroller } from './horizontal-scroller';
import { HomeProductCard } from './home-card';

const ROW_SIZE = 12;

const DEFAULT_LABEL: Record<ShowcaseType, { en: string; ar: string }> = {
  BEST_SELLERS: { en: 'Best sellers', ar: 'الأكثر مبيعًا' },
  NEW_ARRIVALS: { en: 'New arrivals', ar: 'وصل حديثًا' },
  ON_SALE: { en: 'On sale', ar: 'التخفيضات' },
};

const QUERY_FOR: Record<ShowcaseType, ProductListQuery> = {
  BEST_SELLERS: { sort: 'best_selling', pageSize: ROW_SIZE },
  NEW_ARRIVALS: { sort: 'newest', pageSize: ROW_SIZE },
  ON_SALE: { onSale: true, pageSize: ROW_SIZE },
};

/**
 * A built-in "smart" home row — best sellers / new arrivals / on sale. Same
 * shape as a featured-category row (a horizontal scroll of `HomeProductCard`s),
 * but the products come from a computed query rather than a real category.
 * Slotted into the featured-row order by `HomeShowcase.sortOrder`. Hidden when
 * the query has no products.
 */
export function ShowcaseRow({
  locale,
  showcase,
  delayMs = 0,
}: {
  locale: string;
  showcase: HomeShowcase;
  delayMs?: number;
}) {
  const isAr = locale === 'ar';
  const label =
    (isAr ? showcase.labelAr : showcase.labelEn)?.trim() ||
    (isAr ? DEFAULT_LABEL[showcase.type].ar : DEFAULT_LABEL[showcase.type].en);
  const { data, isPending } = useProducts(QUERY_FOR[showcase.type]);
  const items = data?.items ?? [];
  const [ref, revealClass, revealStyle] = useReveal(delayMs);

  if (!isPending && items.length === 0) return null;

  return (
    <div ref={ref} className={revealClass} style={revealStyle}>
      <HorizontalScroller locale={locale} title={label} ariaLabel={label}>
        {isPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="media-tile-skeleton skeleton" aria-hidden />
            ))
          : items.map((p) => <HomeProductCard key={p.id} product={p} locale={isAr ? 'ar' : 'en'} />)}
      </HorizontalScroller>
    </div>
  );
}
