import { describe, it, expect } from 'vitest';
import reducer, {
  setCategory,
  toggleSize,
  toggleColor,
  setPriceRange,
  setSort,
  setSearch,
  setPage,
  resetFilters,
  selectProductListQuery,
} from './uiFiltersSlice';
import type { RootState } from '../store';

const initial = reducer(undefined, { type: '@@INIT' });

describe('uiFiltersSlice', () => {
  it('has sensible defaults matching the API', () => {
    expect(initial).toEqual({
      categoryId: null,
      size: null,
      color: null,
      minPrice: null,
      maxPrice: null,
      sort: 'newest',
      search: '',
      page: 1,
    });
  });

  it('toggleSize sets then clears on the same value', () => {
    const s1 = reducer(initial, toggleSize('M'));
    expect(s1.size).toBe('M');
    const s2 = reducer(s1, toggleSize('M'));
    expect(s2.size).toBeNull();
    const s3 = reducer(s1, toggleSize('L'));
    expect(s3.size).toBe('L');
  });

  it('toggleColor behaves the same', () => {
    const s = reducer(initial, toggleColor('Black'));
    expect(s.color).toBe('Black');
    expect(reducer(s, toggleColor('Black')).color).toBeNull();
  });

  it('any filter change resets the page to 1', () => {
    const paged = reducer(initial, setPage(4));
    expect(paged.page).toBe(4);
    expect(reducer(paged, setSort('price_asc')).page).toBe(1);
    expect(reducer(paged, setSearch('hoodie')).page).toBe(1);
    expect(reducer(paged, setCategory('cat-1')).page).toBe(1);
    expect(reducer(paged, setPriceRange({ min: 10, max: 50 })).page).toBe(1);
  });

  it('setPage clamps to >= 1 and truncates', () => {
    expect(reducer(initial, setPage(0)).page).toBe(1);
    expect(reducer(initial, setPage(3.7)).page).toBe(3);
  });

  it('resetFilters returns the initial state', () => {
    const dirty = reducer(initial, setSearch('x'));
    expect(reducer(dirty, resetFilters())).toEqual(initial);
  });

  describe('selectProductListQuery', () => {
    it('maps active filters, drops empties, always includes sort + page', () => {
      let s = initial;
      s = reducer(s, setCategory('cat-1'));
      s = reducer(s, toggleSize('M'));
      s = reducer(s, setPriceRange({ min: 20, max: null }));
      s = reducer(s, setSort('price_desc'));
      s = reducer(s, setPage(2));

      const query = selectProductListQuery('col-1')({ uiFilters: s } as RootState);
      expect(query).toEqual({
        collectionId: 'col-1',
        categoryId: 'cat-1',
        size: 'M',
        minPrice: 20,
        sort: 'price_desc',
        page: 2,
      });
    });

    it('omits collectionId when not given', () => {
      const query = selectProductListQuery()({ uiFilters: initial } as RootState);
      expect(query).toEqual({ sort: 'newest', page: 1 });
    });
  });
});
