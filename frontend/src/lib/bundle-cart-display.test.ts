import { describe, expect, it } from 'vitest';
import { bundleCartDisplay } from './bundle-cart-display';
import type { CartView } from './types';

const line = (id: string, quantity: number, lineTotal: number, individualUnitPriceCents?: number) => ({
  id, quantity, lineTotal, individualUnitPriceCents, bundleID: individualUnitPriceCents == null ? null : 'bundle',
});
const cart = (items: ReturnType<typeof line>[], subtotal: number) => ({ items, subtotal } as CartView);

describe('bundle cart display', () => {
  it('shows individual prices, surplus and unrelated lines before one separate discount', () => {
    const display = bundleCartDisplay(cart([
      line('a', 2, 1.75, 100), // one bundled unit at $0.75; one surplus at $1
      line('b', 1, 0.75, 100),
      line('other', 1, 3),
    ], 5.5));
    expect(display?.lines.get('a')).toEqual({ total: 2, unitPrice: 1 });
    expect(display?.lines.get('b')).toEqual({ total: 1, unitPrice: 1 });
    expect(display?.lines.get('other')).toEqual({ total: 3, unitPrice: null });
    expect(display?.subtotal).toBe(6);
    expect(display?.discount).toBe(0.5);
  });

  it('keeps the server subtotal when a bundle display basis is missing or inconsistent', () => {
    expect(bundleCartDisplay(cart([line('a', 1, 0.75)], 0.75))).toBeNull();
    expect(bundleCartDisplay(cart([line('a', 1, 0.75, 100)], 1))).toBeNull();
  });
});
