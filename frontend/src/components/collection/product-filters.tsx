'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectUiFilters,
  setCategory,
  setColor,
  setPriceRange,
  setSize,
  setSort,
  resetFilters,
} from '@/store/slices/uiFiltersSlice';
import { Button, Drawer, Icon, Input, Select } from '@/components/ui';
import type { Category, ProductSort } from '@/lib/types';

/**
 * Filter + sort controls for a product listing page, laid out as a single
 * compact row: a "Filters" button (opens a slide-in `<Drawer>` with the
 * category / size / colour / price controls) sitting next to an inline Sort
 * dropdown. Keeping only these two in the toolbar leaves the product grid as
 * much room as possible; the full control set lives in the drawer.
 *
 * `categories` is only passed on a collection page (it aggregates products
 * across categories, so a category filter narrows it); a category page is
 * already scoped and omits it. `sizes` / `colors` are the available facet
 * values for the current scope, independent of the applied filters.
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

  const filterGroups = (
    <>
      {categories && categories.length > 0 && (
        <div className="product-filters__group">
          <label htmlFor="pf-category" className="product-filters__label">
            {isAr ? 'الفئة' : 'Category'}
          </label>
          <Select
            id="pf-category"
            value={filters.categoryId ?? ''}
            onChange={(e) => dispatch(setCategory(e.target.value || null))}
          >
            <option value="">{isAr ? 'كل الفئات' : 'All categories'}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {isAr ? cat.nameAr : cat.nameEn}
              </option>
            ))}
          </Select>
        </div>
      )}

      {sizes.length > 0 && (
        <div className="product-filters__group">
          <label htmlFor="pf-size" className="product-filters__label">
            {isAr ? 'المقاس' : 'Size'}
          </label>
          <Select
            id="pf-size"
            value={filters.size ?? ''}
            onChange={(e) => dispatch(setSize(e.target.value || null))}
          >
            <option value="">{isAr ? 'كل المقاسات' : 'Any size'}</option>
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
      )}

      {colors.length > 0 && (
        <div className="product-filters__group">
          <label htmlFor="pf-color" className="product-filters__label">
            {isAr ? 'اللون' : 'Colour'}
          </label>
          <Select
            id="pf-color"
            value={filters.color ?? ''}
            onChange={(e) => dispatch(setColor(e.target.value || null))}
          >
            <option value="">{isAr ? 'كل الألوان' : 'Any colour'}</option>
            {colors.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </Select>
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

      {hasActiveFilters && (
        <button type="button" className="product-filters__clear" onClick={() => dispatch(resetFilters())}>
          {isAr ? 'مسح الفلاتر' : 'Clear filters'}
        </button>
      )}
    </>
  );

  return (
    <div className="product-filters-bar">
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

      <Select
        className="product-filters__sort-inline"
        value={filters.sort}
        onChange={(e) => dispatch(setSort(e.target.value as ProductSort))}
        aria-label={isAr ? 'الترتيب' : 'Sort by'}
      >
        <option value="newest">{isAr ? 'الأحدث' : 'Newest'}</option>
        <option value="price_asc">{isAr ? 'السعر: من الأقل للأعلى' : 'Price: Low to High'}</option>
        <option value="price_desc">{isAr ? 'السعر: من الأعلى للأقل' : 'Price: High to Low'}</option>
      </Select>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="end"
        title={isAr ? 'الفلاتر' : 'Filters'}
        closeLabel={t('Close', 'إغلاق')}
      >
        <div className="product-filters product-filters--drawer">{filterGroups}</div>
      </Drawer>
    </div>
  );
}
