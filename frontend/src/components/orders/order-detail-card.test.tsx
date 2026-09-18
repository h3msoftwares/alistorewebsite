import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderDetailCard } from './order-detail-card';
import type { Order } from '@/lib/types';

const baseOrder: Order = {
  id: 'o1',
  orderNumber: 'AS-20260901-AAA111',
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791111111',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Amman',
  subtotal: '80.00',
  deliveryFee: '0',
  total: '80.00',
  currency: 'USD',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  status: 'DELIVERED',
  dateCreated: '2026-09-01T00:00:00.000Z',
  items: [
    {
      id: 'oi1',
      orderID: 'o1',
      variantID: 'v1',
      productName: 'Test Shirt',
      productSKU: 'SKU-1',
      variantSKU: 'SKU-1-M',
      size: 'M',
      color: null,
      quantity: 4,
      unitPrice: '20.00',
      lineTotal: '80.00',
      returnedQuantity: 1,
    },
  ],
};

describe('<OrderDetailCard> — totals', () => {
  it('shows no discount row when the order has none', () => {
    render(<OrderDetailCard locale="en" order={baseOrder} />);
    expect(screen.queryByText(/Discount/)).not.toBeInTheDocument();
  });

  it('explains a subtotal/total gap with a Discount row naming the coupon', () => {
    const order: Order = { ...baseOrder, discountAmount: '10.00', couponCode: 'SAVE10', total: '70.00' };
    render(<OrderDetailCard locale="en" order={order} />);
    expect(screen.getByText('Discount (SAVE10)')).toBeInTheDocument();
    expect(screen.getByText('−$10.00')).toBeInTheDocument();
  });
});

describe('<OrderDetailCard> — returns', () => {
  it('shows "Request a return" only when delivered and a callback is passed', () => {
    render(<OrderDetailCard locale="en" order={baseOrder} />);
    expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();

    render(<OrderDetailCard locale="en" order={{ ...baseOrder, status: 'SHIPPED' }} onRequestReturn={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
  });

  it('lets the customer pick a quantity (capped at what is still returnable) and submits it', async () => {
    const user = userEvent.setup();
    const onRequestReturn = vi.fn();
    render(<OrderDetailCard locale="en" order={baseOrder} onRequestReturn={onRequestReturn} />);

    await user.click(screen.getByRole('button', { name: 'Request a return' }));
    await user.click(screen.getByRole('checkbox', { name: /Test Shirt/ }));

    // 4 ordered, 1 already claimed by an existing return — 3 left.
    const increase = screen.getByRole('button', { name: /Increase/ });
    for (let i = 0; i < 5; i++) await user.click(increase); // try to overshoot the cap
    expect(screen.getByLabelText('Quantity for Test Shirt')).toHaveTextContent('3');

    await user.click(screen.getByRole('button', { name: 'Submit return request' }));
    expect(onRequestReturn).toHaveBeenCalledWith({
      items: [{ orderItemID: 'oi1', quantity: 3 }],
      reason: undefined,
    });
  });

  it('renders an existing return read-only, with a Withdraw button only while it is still cancellable', async () => {
    const user = userEvent.setup();
    const onCancelReturn = vi.fn();
    const order: Order = {
      ...baseOrder,
      returns: [
        {
          id: 'r1',
          orderID: 'o1',
          status: 'REQUESTED',
          refundAmount: '20.00',
          dateCreated: '2026-09-02T00:00:00.000Z',
          items: [{ id: 'ri1', returnID: 'r1', orderItemID: 'oi1', quantity: 1, refundAmount: '20.00' }],
        },
      ],
    };
    render(<OrderDetailCard locale="en" order={order} onCancelReturn={onCancelReturn} />);

    expect(screen.getByText('Test Shirt × 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Withdraw request' }));
    expect(onCancelReturn).toHaveBeenCalledWith('r1');
  });

  it('does not offer to withdraw a REJECTED return', () => {
    const order: Order = {
      ...baseOrder,
      returns: [
        {
          id: 'r1',
          orderID: 'o1',
          status: 'REJECTED',
          refundAmount: '20.00',
          dateCreated: '2026-09-02T00:00:00.000Z',
          items: [{ id: 'ri1', returnID: 'r1', orderItemID: 'oi1', quantity: 1, refundAmount: '20.00' }],
        },
      ],
    };
    render(<OrderDetailCard locale="en" order={order} onCancelReturn={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Withdraw request' })).not.toBeInTheDocument();
  });
});
