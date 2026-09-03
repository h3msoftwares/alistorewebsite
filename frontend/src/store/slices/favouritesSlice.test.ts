import { describe, it, expect } from 'vitest';
import reducer, {
  toggleFavourite,
  setFavourites,
  clearFavourites,
  selectFavouriteIds,
  selectFavouritesCount,
  selectIsFavourite,
} from './favouritesSlice';
import type { RootState } from '../store';

describe('favouritesSlice', () => {
  it('defaults to an empty list', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ ids: [] });
  });

  it('toggleFavourite adds then removes an id', () => {
    const added = reducer(undefined, toggleFavourite('p1'));
    expect(added.ids).toEqual(['p1']);
    expect(reducer(added, toggleFavourite('p1')).ids).toEqual([]);
  });

  it('setFavourites replaces the list and de-dupes', () => {
    expect(reducer(undefined, setFavourites(['a', 'b', 'a'])).ids).toEqual(['a', 'b']);
  });

  it('clearFavourites empties the list', () => {
    expect(reducer({ ids: ['x', 'y'] }, clearFavourites()).ids).toEqual([]);
  });

  it('selectors read the slice', () => {
    const state = { favourites: { ids: ['a', 'b'] } } as RootState;
    expect(selectFavouriteIds(state)).toEqual(['a', 'b']);
    expect(selectFavouritesCount(state)).toBe(2);
    expect(selectIsFavourite('a')(state)).toBe(true);
    expect(selectIsFavourite('z')(state)).toBe(false);
  });
});
