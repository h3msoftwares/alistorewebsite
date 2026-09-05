'use client';

import { useMemo } from 'react';
import { ProductPreviewCard } from '@/components/collection/product-preview-card';
import { HorizontalScroller } from '@/components/home/horizontal-scroller';
import { useCategoryProducts } from '@/hooks/use-catalog';
import type { UUID } from '@/lib/types';

const CAP = 8;
// Fetched beyond CAP so there's still enough left to fill it after excluding
// the current product and after in-stock candidates are given priority.
const FETCH_BUFFER = 20;

/**
 * "You might also like" — other active products in the same category,
 * excluding the current one, in-stock candidates first. Purely additive: no
 * loading skeleton beyond what ProductGridSkeleton already gives it (matches
 * how the rest of the PDP handles loading — see ProductDetailSkeleton), and
 * renders nothing at all on error or when there's simply nothing else in the
 * category, rather than showing an empty/error state for a nice-to-have.
 */
export function RelatedProducts({
  categoryId,
  excludeProductId,
  locale,
}: {
  categoryId: UUID;
  excludeProductId: UUID;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data, isPending, isError } = useCategoryProducts(categoryId, { pageSize: FETCH_BUFFER });

  const items = useMemo(() => {
    const candidates = (data?.items ?? []).filter((p) => p.id !== excludeProductId);
    // In-stock first; stable within each group, so the API's own ordering
    // (newest-first by default) is preserved inside each bucket.
    const inStock = candidates.filter((p) => p.variants.some((v) => v.stockQuantity > 0));
    const outOfStock = candidates.filter((p) => !p.variants.some((v) => v.stockQuantity > 0));
    return [...inStock, ...outOfStock].slice(0, CAP);
  }, [data, excludeProductId]);

  const title = t('You might also like', 'قد يعجبك أيضًا');

  if (isPending) {
    return (
      <div className="pdp__related" aria-busy="true" aria-live="polite">
        <HorizontalScroller locale={locale} title={title} ariaLabel={title}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="media-tile-skeleton skeleton" aria-hidden />
          ))}
        </HorizontalScroller>
      </div>
    );
  }

  if (isError || items.length === 0) return null;

  return (
    <div className="pdp__related">
      <HorizontalScroller locale={locale} title={title} ariaLabel={title}>
        {items.map((product) => (
          <ProductPreviewCard key={product.id} product={product} locale={locale} />
        ))}
      </HorizontalScroller>
    </div>
  );
}
