'use client';

import { useAppSelector } from '@/store/hooks';
import { selectProductListQuery } from '@/store/slices/uiFiltersSlice';
import { useProducts } from '@/hooks/use-catalog';
import { ProductGridSkeleton } from '@/components/ui';

/**
 * Product listing for a collection page. Structure only — reads the filter
 * state from the `uiFilters` slice and hits `GET /api/products`.
 * TODO (Week 2, T12/T13): full product grid + filter UI (size / colour / price /
 * sort) + pagination controls.
 */
export function CollectionProducts({
  collectionId,
  locale,
}: {
  collectionId: string;
  locale: string;
}) {
  const isAr = locale === 'ar';
  const query = useAppSelector(selectProductListQuery(collectionId));
  const { data, isPending } = useProducts(query);

  return (
    <section className="container section" aria-label={isAr ? 'المنتجات' : 'Products'}>
      <h2 className="collection-page__subhead">{isAr ? 'المنتجات' : 'Products'}</h2>
      {isPending ? (
        <ProductGridSkeleton count={8} />
      ) : (
        <p className="prose">
          {(data?.total ?? 0) === 0
            ? isAr
              ? 'لا توجد منتجات بعد.'
              : 'No products yet.'
            : isAr
              ? `${data?.total} منتج`
              : `${data?.total} products`}
        </p>
      )}
    </section>
  );
}
