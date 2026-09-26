import { describe, it, expect } from 'vitest';
import { swapLocalePath } from './locale-path';

describe('swapLocalePath', () => {
  it('swaps the leading locale segment and keeps the rest of the path', () => {
    expect(swapLocalePath('/en/admin/products', 'ar')).toBe('/ar/admin/products');
    expect(swapLocalePath('/ar/admin', 'en')).toBe('/en/admin');
  });

  it('handles the bare locale root with no trailing path', () => {
    expect(swapLocalePath('/en', 'ar')).toBe('/ar');
  });

  it('is a no-op swap when the target locale already matches', () => {
    expect(swapLocalePath('/en/admin/orders/42', 'en')).toBe('/en/admin/orders/42');
  });
});
