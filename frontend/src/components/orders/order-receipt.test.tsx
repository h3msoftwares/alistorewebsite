import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderReceipt } from './order-receipt';
import { formatCurrency } from '@/lib/format';
import type { Order } from '@/lib/types';

const order = {
  orderNumber: 'AS-1', dateCreated: '2026-09-30T00:00:00Z', deliveryName: 'Buyer',
  deliveryAddress: 'Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT', deliveryPhone: '123456789',
  subtotal: '1.50', deliveryFee: '0', total: '1.50', paymentStatus: 'PENDING',
  items: [
    { id: 'a', productName: 'A', quantity: 1, lineTotal: '0.75', priceBreakdown: { version: 3, bundleID: 'b', individualUnitPriceCents: 100 } },
    { id: 'b', productName: 'B', quantity: 1, lineTotal: '0.75', priceBreakdown: { version: 3, bundleID: 'b', individualUnitPriceCents: 100 } },
  ],
} as Order;

describe('printed order receipt', () => {
  it.each(['en', 'ar'] as const)('shows individual purchase-time prices and a Bundle discount in %s', locale => {
    render(<OrderReceipt order={order} locale={locale} brandName="Shop" />);
    expect(screen.getByText(locale === 'en' ? 'Bundle discount' : 'خصم الباقة')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === `−${formatCurrency(0.5, locale)}`)).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.tagName === 'TD' && element.textContent === formatCurrency(1, locale))).toHaveLength(2);
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === formatCurrency(2, locale))).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === formatCurrency(1.5, locale))).toBeInTheDocument();
  });
});
