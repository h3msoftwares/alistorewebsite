'use client';

import { useState } from 'react';
import { Pin, PinOff, SlidersHorizontal } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectUiFilters,
  setCategory,
  setColor,
  setOnSale,
  setPriceRange,
  setSize,
  setSort,
  resetFilters,
} from '@/store/slices/uiFiltersSlice';
import { Choice, Drawer, Icon, Input, Select } from '@/components/ui';
import { colorLabel } from '@/lib/product-variants';
import type { Category, ProductSort } from '@/lib/types';

/**
 * Filter + sort controls for a product listing page.
 *
 * - Wide screens: a row of compact `<select>` dropdowns (category / size /
 *   colour / sort) + a price range, inline in `.products-toolbar`.
 * - Narrow screens (≤767px): collapses to a single "Filters" button that
 *   opens the same controls in a slide-in `<Drawer>`.
 * - A pin toggle makes the whole toolbar stick below the header while the
 *   grid scrolls.
 *
 * `categories` is only passed on a collection page. `sizes` / `colors` are
 * the available facet values for the current scope.
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
  const [pinned, setPinned] = useState(false);

  const hasActiveFilters =
    filters.categoryId !== null ||
    filters.size !== null ||
    filters.color !== null ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.onSale;

  // Rendered twice (inline bar + drawer), so ids get a per-copy suffix.
  const controls = (scope: 'bar' | 'drawer') => (
    <>
      {categories && categories.length > 0 && (
        <div className="product-filters__group">
          <label htmlFor={`pf-category-${scope}`} className="product-filters__label">
            {isAr ? 'الفئة' : 'Category'}
          </label>
          <Select
            id={`pf-category-${scope}`}
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
          <label htmlFor={`pf-size-${scope}`} className="product-filters__label">
            {isAr ? 'المقاس' : 'Size'}
          </label>
          <Select
            id={`pf-size-${scope}`}
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
          <label htmlFor={`pf-color-${scope}`} className="product-filters__label">
            {isAr ? 'اللون' : 'Colour'}
          </label>
          <Select
            id={`pf-color-${scope}`}
            value={filters.color ?? ''}
            onChange={(e) => dispatch(setColor(e.target.value || null))}
          >
            <option value="">{isAr ? 'كل الألوان' : 'Any colour'}</option>
            {colors.map((color) => (
              <option key={color} value={color}>
                {colorLabel(color, isAr ? 'ar' : 'en')}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="product-filters__group">
        <label htmlFor={`pf-sort-${scope}`} className="product-filters__label">
          {isAr ? 'الترتيب' : 'Sort by'}
        </label>
        <Select
          id={`pf-sort-${scope}`}
          value={filters.sort}
          onChange={(e) => dispatch(setSort(e.target.value as ProductSort))}
        >
          <option value="newest">{isAr ? 'الأحدث' : 'Newest'}</option>
          <option value="price_asc">{isAr ? 'الأقل سعرًا' : 'Price: low to high'}</option>
          <option value="price_desc">{isAr ? 'الأعلى سعرًا' : 'Price: high to low'}</option>
        </Select>
      </div>

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

      <div className="product-filters__group product-filters__group--check">
        <Choice
          type="checkbox"
          label={isAr ? 'التخفيضات فقط' : 'On sale only'}
          checked={filters.onSale}
          onChange={(e) => dispatch(setOnSale(e.target.checked))}
        />
      </div>

      {hasActiveFilters && (
        <button type="button" className="product-filters__clear" onClick={() => dispatch(resetFilters())}>
          {isAr ? 'مسح' : 'Clear'}
        </button>
      )}
    </>
  );

  return (
    <div className="product-filters-wrap" data-filters-pinned={pinned || undefined}>
      <div className="product-filters-bar product-filters-bar--inline">{controls('bar')}</div>

      <div className="product-filters-bar product-filters-bar--collapsed">
        <button
          type="button"
          className="btn btn--outline btn--sm product-filters__trigger"
          onClick={() => setOpen(true)}
          aria-expanded={open}
        >
          <Icon as={SlidersHorizontal} size={14} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {isAr ? 'الفلاتر' : 'Filters'}
          {hasActiveFilters && <span className="product-filters__trigger-dot" aria-hidden />}
        </button>
      </div>

      <button
        type="button"
        className="icon-btn icon-btn--bordered product-filters__pin"
        data-active={pinned || undefined}
        aria-pressed={pinned}
        aria-label={
          pinned
            ? t('Unpin the filter bar', 'إلغاء تثبيت شريط الفلاتر')
            : t('Pin the filter bar below the header', 'تثبيت شريط الفلاتر أسفل الترويسة')
        }
        title={pinned ? t('Unpin', 'إلغاء التثبيت') : t('Pin below header', 'تثبيت أسفل الترويسة')}
        onClick={() => setPinned((p) => !p)}
      >
        <Icon as={pinned ? PinOff : Pin} size={14} />
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="end"
        title={isAr ? 'الفلاتر' : 'Filters'}
        closeLabel={t('Close', 'إغلاق')}
      >
        <div className="product-filters product-filters--drawer">{controls('drawer')}</div>
      </Drawer>
    </div>
  );
}
