'use client';

import { useMemo } from 'react';
import { ProductGridSkeleton } from '@/components/ui';
import { ProductPreviewCard } from '@/components/collection/product-preview-card';
import { useCategoryProducts } from '@/hooks/use-catalog';
import type { UUID } from '@/lib/types';

const CAP = 4;
// Fetched beyond CAP so there's still enough left to fill it after excluding
// the current product and after in-stock candidates are given priority.
const FETCH_BUFFER = 12;

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

  if (isPending) {
    return (
      <section className="pdp__related" aria-busy="true" aria-live="polite">
        <h2>{t('You might also like', 'قد يعجبك أيضًا')}</h2>
        <ProductGridSkeleton count={CAP} />
      </section>
    );
  }

  if (isError || items.length === 0) return null;

  return (
    <section className="pdp__related">
      <h2>{t('You might also like', 'قد يعجبك أيضًا')}</h2>
      <div className="product-grid">
        {items.map((product) => (
          <ProductPreviewCard key={product.id} product={product} locale={locale} />
        ))}
      </div>
    </section>
  );
}
