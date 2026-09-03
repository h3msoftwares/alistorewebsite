import { describe, it, expect } from 'vitest';
import reducer, { setItemCount, resetItemCount, selectCartCount } from './cartSlice';
import type { RootState } from '../store';

describe('cartSlice', () => {
  it('defaults to zero', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ itemCount: 0 });
  });

  it('setItemCount stores the count', () => {
    expect(reducer(undefined, setItemCount(4)).itemCount).toBe(4);
  });

  it('setItemCount clamps negatives and truncates fractions', () => {
    expect(reducer(undefined, setItemCount(-3)).itemCount).toBe(0);
    expect(reducer(undefined, setItemCount(2.9)).itemCount).toBe(2);
  });

  it('resetItemCount zeroes it', () => {
    expect(reducer({ itemCount: 9 }, resetItemCount()).itemCount).toBe(0);
  });

  it('selectCartCount reads the slice', () => {
    expect(selectCartCount({ cart: { itemCount: 7 } } as RootState)).toBe(7);
  });
});
