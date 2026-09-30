import { describe, expect, it } from 'vitest';
import type { Order } from './types';
import { bundleOrderDisplay } from './bundle-order-display';

const order = {
  subtotal: '1.50',
  items: [
    { id: 'a', quantity: 1, lineTotal: '0.75', priceBreakdown: { version: 3, bundleID: 'b', individualUnitPriceCents: 100 } },
    { id: 'b', quantity: 1, lineTotal: '0.75', priceBreakdown: { version: 3, bundleID: 'b', individualUnitPriceCents: 100 } },
  ],
} as Order;

describe('Bundle order presentation', () => {
  it('shows individual purchase-time prices and one group discount without changing paid allocations', () => {
    const display = bundleOrderDisplay(order)!;
    expect(display.subtotal).toBe(2);
    expect(display.discount).toBe(0.5);
    expect([...display.lines.values()]).toEqual([{ total: 1, unitPrice: 1 }, { total: 1, unitPrice: 1 }]);
    expect(order.items.map((item) => item.lineTotal)).toEqual(['0.75', '0.75']);
  });

  it('includes surplus at its individual price and leaves unrelated lines at their paid price', () => {
    const display = bundleOrderDisplay({ subtotal: '3.00', items: [
      { ...order.items[0], quantity: 2, lineTotal: '1.75' },
      order.items[1],
      { ...order.items[1], id: 'c', quantity: 1, lineTotal: '0.50', priceBreakdown: null },
    ] });
    expect(display).toMatchObject({ subtotal: 3.5, discount: 0.5 });
    expect(display?.lines.get('a')).toEqual({ total: 2, unitPrice: 1 });
    expect(display?.lines.get('c')).toEqual({ total: 0.5, unitPrice: null });
  });

  it('falls back to paid lines if a historical snapshot cannot reconcile', () => {
    expect(bundleOrderDisplay({ ...order, items: [order.items[0], { ...order.items[1], priceBreakdown: { version: 3 } }] })).toBeNull();
    expect(bundleOrderDisplay({ ...order, subtotal: '1.49' })).toBeNull();
  });
});
