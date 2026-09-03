'use client';

import { useCategoryProducts } from '@/hooks/use-catalog';
import { ProductGridSkeleton } from '@/components/ui';

/**
 * Products preview for a category page — hits `GET /api/categories/:id/products`
 * (the same shaped list a collection's products come from). Structure only, to
 * match `CollectionProducts`.
 * TODO (Week 2): full product grid + filter UI + pagination.
 */
export function CategoryProducts({
  categoryId,
  locale,
}: {
  categoryId: string;
  locale: string;
}) {
  const isAr = locale === 'ar';
  const { data, isPending } = useCategoryProducts(categoryId, { pageSize: 12 });

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
