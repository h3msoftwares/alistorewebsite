'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectProductListQuery, selectUiFilters, setPage, resetFilters } from '@/store/slices/uiFiltersSlice';
import { useCategories, useCollectionFacets, useProducts } from '@/hooks/use-catalog';
import { Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { ProductFilters } from './product-filters';
import { Breadcrumb } from './breadcrumb';
import { ProductPreviewCard } from './product-preview-card';

/** Product listing for a collection page: a compact toolbar (Home / Collection
 *  breadcrumb + filter/sort panel, side by side) + a real product grid +
 *  pagination, scoped to every category in the collection (with a category
 *  chip to narrow it — see `ProductFilters`). Kept dense so more of the grid
 *  is visible without scrolling. */
export function CollectionProducts({
  collectionId,
  locale,
  name,
}: {
  collectionId: string;
  locale: string;
  name: string;
}) {
  const isAr = locale === 'ar';
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectUiFilters);
  const query = useAppSelector(selectProductListQuery(collectionId));
  const { data, isPending } = useProducts(query);
  const { data: categories } = useCategories(collectionId);
  const { data: facets } = useCollectionFacets(collectionId);

  // A stale filter (a category from a different collection, a price range
  // that no longer matches) shouldn't carry over when the user browses into
  // a different collection.
  useEffect(() => {
    dispatch(resetFilters());
  }, [collectionId, dispatch]);

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="container products-section" aria-label={isAr ? 'المنتجات' : 'Products'}>
      <div className="products-toolbar">
        <Breadcrumb
          ariaLabel={isAr ? 'مسار التنقل' : 'Breadcrumb'}
          items={[{ label: isAr ? 'الرئيسية' : 'Home', href: `/${locale}` }, { label: name }]}
        />
        <ProductFilters locale={locale} sizes={facets?.sizes ?? []} colors={facets?.colors ?? []} categories={categories} />
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
            {items.map((product) => (
              <ProductPreviewCard key={product.id} product={product} locale={locale as 'en' | 'ar'} />
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
