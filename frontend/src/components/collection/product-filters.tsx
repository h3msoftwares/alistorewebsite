'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectUiFilters,
  setCategory,
  setPriceRange,
  setSort,
  toggleColor,
  toggleSize,
  resetFilters,
} from '@/store/slices/uiFiltersSlice';
import { Button, Drawer, Icon, Input, SizeChip, Select } from '@/components/ui';
import type { Category, ProductSort } from '@/lib/types';

/**
 * Filter + sort panel for a product listing page. `categories` is only
 * passed on a collection page (it aggregates products across multiple
 * categories, so a category filter narrows it down); a category page is
 * already scoped to one category and omits it. `sizes` / `colors` are the
 * available facet values for the current scope (see `useCollectionFacets` /
 * `useCategoryFacets`) — independent of which filters are currently applied.
 *
 * Below the `product-grid`'s own mobile breakpoint (599px) the panel
 * doesn't fit inline next to the breadcrumb any more, so it becomes a
 * "Filters" button that opens the same controls in a slide-in `<Drawer>`
 * instead — the filter content itself (and the Redux state it reads/writes)
 * is identical either way, just two CSS-toggled containers around one JSX
 * fragment so the inline and drawer copies can never drift apart.
 */
export function ProductFilters({
  locale,
  sizes,
  colors,
  categories,
}: {
  locale: string;
  sizes: string[];
  colors: string[];
  categories?: Category[];
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectUiFilters);
  const [open, setOpen] = useState(false);

  const hasActiveFilters =
    filters.categoryId !== null ||
    filters.size !== null ||
    filters.color !== null ||
    filters.minPrice !== null ||
    filters.maxPrice !== null;

  // Rendered twice (inline + drawer), so anything needing a document-unique
  // id/`htmlFor` gets a per-copy suffix.
  const renderBody = (scope: 'inline' | 'drawer') => (
    <>
      {categories && categories.length > 0 && (
        <div className="product-filters__group">
          <span className="product-filters__label">{isAr ? 'الفئة' : 'Category'}</span>
          <div className="chip-group">
            <SizeChip selected={filters.categoryId === null} onClick={() => dispatch(setCategory(null))}>
              {isAr ? 'الكل' : 'All'}
            </SizeChip>
            {categories.map((cat) => (
              <SizeChip
                key={cat.id}
                selected={filters.categoryId === cat.id}
                onClick={() => dispatch(setCategory(cat.id))}
              >
                {isAr ? cat.nameAr : cat.nameEn}
              </SizeChip>
            ))}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div className="product-filters__group">
          <span className="product-filters__label">{isAr ? 'المقاس' : 'Size'}</span>
          <div className="chip-group">
            {sizes.map((size) => (
              <SizeChip key={size} selected={filters.size === size} onClick={() => dispatch(toggleSize(size))}>
                {size}
              </SizeChip>
            ))}
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <div className="product-filters__group">
          <span className="product-filters__label">{isAr ? 'اللون' : 'Colour'}</span>
          <div className="chip-group">
            {colors.map((color) => (
              <SizeChip key={color} selected={filters.color === color} onClick={() => dispatch(toggleColor(color))}>
                {color}
              </SizeChip>
            ))}
          </div>
        </div>
      )}

      <div className="product-filters__group">
        <span className="product-filters__label">{isAr ? 'السعر' : 'Price'}</span>
        <div className="product-filters__price">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={isAr ? 'أقل سعر' : 'Minimum price'}
            placeholder={isAr ? 'من' : 'Min'}
            value={filters.minPrice ?? ''}
            onChange={(e) =>
              dispatch(
                setPriceRange({
                  min: e.target.value === '' ? null : Number(e.target.value),
                  max: filters.maxPrice,
                })
              )
            }
          />
          <span className="product-filters__price-sep" aria-hidden>
            –
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={isAr ? 'أعلى سعر' : 'Maximum price'}
            placeholder={isAr ? 'إلى' : 'Max'}
            value={filters.maxPrice ?? ''}
            onChange={(e) =>
              dispatch(
                setPriceRange({
                  min: filters.minPrice,
                  max: e.target.value === '' ? null : Number(e.target.value),
                })
              )
            }
          />
        </div>
      </div>

      <div className="product-filters__group product-filters__sort">
        <label htmlFor={`product-sort-${scope}`} className="product-filters__label">
          {isAr ? 'الترتيب' : 'Sort by'}
        </label>
        <Select
          id={`product-sort-${scope}`}
          value={filters.sort}
          onChange={(e) => dispatch(setSort(e.target.value as ProductSort))}
        >
          <option value="newest">{isAr ? 'الأحدث' : 'Newest'}</option>
          <option value="price_asc">{isAr ? 'السعر: من الأقل للأعلى' : 'Price: Low to High'}</option>
          <option value="price_desc">{isAr ? 'السعر: من الأعلى للأقل' : 'Price: High to Low'}</option>
        </Select>
      </div>

      {hasActiveFilters && (
        <button type="button" className="product-filters__clear" onClick={() => dispatch(resetFilters())}>
          {isAr ? 'مسح الفلاتر' : 'Clear filters'}
        </button>
      )}
    </>
  );

  return (
    <>
      {/* Desktop/tablet: the panel sits inline next to the breadcrumb —
          display:contents so this wrapper doesn't disturb .products-toolbar's
          flex layout, the way a bare .product-filters used to. */}
      <div className="product-filters-inline">
        <div className="product-filters">{renderBody('inline')}</div>
      </div>

      {/* Small screens only (see globals.css's 599px breakpoint, shared with
          .product-grid's own mobile column count): a compact trigger that
          opens the exact same controls in a slide-in drawer instead. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="product-filters__trigger"
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <Icon as={SlidersHorizontal} size={14} style={{ marginInlineEnd: 'var(--space-2)' }} />
        {isAr ? 'الفلاتر' : 'Filters'}
        {hasActiveFilters && <span className="product-filters__trigger-dot" aria-hidden />}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="end"
        title={isAr ? 'الفلاتر' : 'Filters'}
        closeLabel={t('Close', 'إغلاق')}
      >
        <div className="product-filters product-filters--drawer">{renderBody('drawer')}</div>
      </Drawer>
    </>
  );
}
