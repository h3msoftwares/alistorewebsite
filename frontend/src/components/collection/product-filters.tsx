'use client';

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
import { Input, SizeChip, Select } from '@/components/ui';
import type { Category, ProductSort } from '@/lib/types';

/**
 * Filter + sort panel for a product listing page. `categories` is only
 * passed on a collection page (it aggregates products across multiple
 * categories, so a category filter narrows it down); a category page is
 * already scoped to one category and omits it. `sizes` / `colors` are the
 * available facet values for the current scope (see `useCollectionFacets` /
 * `useCategoryFacets`) — independent of which filters are currently applied.
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
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectUiFilters);

  const hasActiveFilters =
    filters.categoryId !== null ||
    filters.size !== null ||
    filters.color !== null ||
    filters.minPrice !== null ||
    filters.maxPrice !== null;

  return (
    <div className="product-filters">
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
        <label htmlFor="product-sort" className="product-filters__label">
          {isAr ? 'الترتيب' : 'Sort by'}
        </label>
        <Select
          id="product-sort"
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
    </div>
  );
}
