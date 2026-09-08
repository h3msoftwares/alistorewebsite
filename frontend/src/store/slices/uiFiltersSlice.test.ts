import { describe, it, expect } from 'vitest';
import reducer, {
  setCategory,
  toggleSize,
  toggleColor,
  setSize,
  setColor,
  setPriceRange,
  setSort,
  setSearch,
  setPage,
  resetFilters,
  buildProductListQuery,
} from './uiFiltersSlice';

const initial = reducer(undefined, { type: '@@INIT' });

describe('uiFiltersSlice', () => {
  it('has sensible defaults matching the API', () => {
    expect(initial).toEqual({
      categoryId: null,
      size: null,
      color: null,
      minPrice: null,
      maxPrice: null,
      onSale: false,
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

  it('setSize / setColor set an absolute value, and "" clears', () => {
    const s1 = reducer(initial, setSize('L'));
    expect(s1.size).toBe('L');
    expect(reducer(s1, setSize('')).size).toBeNull();
    expect(reducer(s1, setSize(null)).size).toBeNull();

    const c1 = reducer(initial, setColor('Red'));
    expect(c1.color).toBe('Red');
    expect(reducer(c1, setColor('')).color).toBeNull();
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

  describe('buildProductListQuery', () => {
    it('maps active filters, drops empties, always includes sort + page', () => {
      let s = initial;
      s = reducer(s, setCategory('cat-1'));
      s = reducer(s, toggleSize('M'));
      s = reducer(s, setPriceRange({ min: 20, max: null }));
      s = reducer(s, setSort('price_desc'));
      s = reducer(s, setPage(2));

      const query = buildProductListQuery(s, 'col-1');
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
      const query = buildProductListQuery(initial);
      expect(query).toEqual({ sort: 'newest', page: 1 });
    });
  });
});
