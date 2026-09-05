'use client';

import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { buildProductListQuery, selectUiFilters, setPage, resetFilters } from '@/store/slices/uiFiltersSlice';
import { useCategoryFacets, useCategoryProducts } from '@/hooks/use-catalog';
import { Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { ProductFilters } from './product-filters';
import { Breadcrumb, type Crumb } from './breadcrumb';
import { ProductPreviewCard } from './product-preview-card';

/** Product listing for a category page: a compact toolbar (Home / Collection /
 *  Category breadcrumb + filter/sort panel, side by side — no category
 *  chip, already scoped to one) + a real product grid + pagination. Hits
 *  `GET /api/categories/:id/products`, the same shaped list a collection's
 *  products come from. Kept dense so more of the grid is visible without
 *  scrolling. */
export function CategoryProducts({
  categoryId,
  locale,
  name,
  collection,
}: {
  categoryId: string;
  locale: string;
  name: string;
  /** The category's parent collection, when it has one (null for a
   *  standalone category) — `name` pre-resolved to the current locale. */
  collection?: { slug: string; name: string } | null;
}) {
  const isAr = locale === 'ar';
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectUiFilters);
  // No collectionId scope — `listCategoryProducts` ignores categoryId/collectionId
  // from the query object anyway (the URL path already scopes it).
  const query = useMemo(() => buildProductListQuery(filters), [filters]);
  const { data, isPending } = useCategoryProducts(categoryId, query);
  const { data: facets } = useCategoryFacets(categoryId);

  // A stale filter from a different category page shouldn't carry over.
  useEffect(() => {
    dispatch(resetFilters());
  }, [categoryId, dispatch]);

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const crumbs: Crumb[] = [
    { label: isAr ? 'الرئيسية' : 'Home', href: `/${locale}` },
    ...(collection ? [{ label: collection.name, href: `/${locale}/${collection.slug}` }] : []),
    { label: name },
  ];

  return (
    <section className="container products-section" aria-label={isAr ? 'المنتجات' : 'Products'}>
      <div className="products-toolbar">
        <Breadcrumb ariaLabel={isAr ? 'مسار التنقل' : 'Breadcrumb'} items={crumbs} />
        <ProductFilters locale={locale} sizes={facets?.sizes ?? []} colors={facets?.colors ?? []} />
      </div>

      {isPending ? (
        <ProductGridSkeleton count={8} />
      ) : items.length === 0 ? (
        <EmptyState
          title={isAr ? 'لا توجد منتجات مطابقة' : 'No products match these filters'}
          body={isAr ? 'جرّب تعديل الفلاتر.' : 'Try adjusting the filters above.'}
        />
      ) : (
        <>
          <div className="product-grid">
            {items.map((product, index) => (
              <ProductPreviewCard
                key={product.id}
                product={product}
                locale={locale as 'en' | 'ar'}
                preload={index < 4}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="product-pager">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page <= 1}
                onClick={() => dispatch(setPage(filters.page - 1))}
              >
                {isAr ? 'السابق' : 'Previous'}
              </Button>
              <span className="product-pager__status">
                {isAr ? `صفحة ${filters.page} من ${totalPages}` : `Page ${filters.page} of ${totalPages}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= totalPages}
                onClick={() => dispatch(setPage(filters.page + 1))}
              >
                {isAr ? 'التالي' : 'Next'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
