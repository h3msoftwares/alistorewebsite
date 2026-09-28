import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderDetailCard } from './order-detail-card';
import type { Order, RefundCalculation, ReturnPreview } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

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
  it.each(['en', 'ar'] as const)('shows final amounts and a neutral adjustment note, hides internal reasons in %s', locale => {
    const order: Order = { ...baseOrder, returns: [{ id: 'r', orderID: 'o1', status: 'REFUNDED', dateCreated: '',
      refundAmount: 20, refundedAmount: 10, refundAdjustmentReason: 'Internal restocking assessment',
      deliveryRefundAmount: 3, deliveryRefundReason: 'Internal courier dispute',
      items: [{ id: 'ri', returnID: 'r', orderItemID: 'oi1', quantity: 1, refundAmount: 20, refundedAmount: 10,
        refundBreakdown: { quantityDiscountAdjustmentCents: 500, refundCents: 2000 } as RefundCalculation }],
    }] };
    render(<OrderDetailCard locale={locale} order={order} />);
    expect(screen.getByText(locale === 'en' ? 'Adjusted by the store' : 'عُدّل بواسطة المتجر')).toBeInTheDocument();
    expect(screen.queryByText(/Internal restocking assessment/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal courier dispute/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quantity-discount adjustment/)).not.toBeInTheDocument();
    expect(screen.queryByText(/تعديل خصم الكمية/)).not.toBeInTheDocument();
  });
  it('shows calculated and effective amounts and reasons to the admin', () => {
    const order: Order = { ...baseOrder, returns: [{ id: 'r', orderID: 'o1', status: 'REFUNDED', dateCreated: '',
      refundAmount: 20, refundedAmount: 10, refundAdjustmentReason: 'Restocking fee',
      items: [{ id: 'ri', returnID: 'r', orderItemID: 'oi1', quantity: 1, refundAmount: 20, refundedAmount: 10 }],
    }] };
    render(<OrderDetailCard locale="en" order={order} audience="admin" />);
    expect(screen.getByText('Calculated merchandise amount: $20.00')).toBeInTheDocument();
    expect(screen.getByText('Effective merchandise refunded: $10.00')).toBeInTheDocument();
    expect(screen.getByText('Adjustment reason: Restocking fee')).toBeInTheDocument();
  });
  it.each(['SHIPPED', 'DELIVERED'] as const)('does not offer customer/guest cancellation for %s orders', (status) => {
    render(<OrderDetailCard locale="en" order={{ ...baseOrder, status }} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument();
  });
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
  it.each(['en', 'ar'] as const)('blocks the request UI and explains unavailable Bundle returns in %s', (locale) => {
    const order = { ...baseOrder, items: baseOrder.items.map((item) => ({ ...item, priceBreakdown: { version: 3 } })) };
    render(<OrderDetailCard locale={locale} order={order} onRequestReturn={vi.fn()} />);
    expect(screen.getByText(locale === 'ar' ? 'إرجاع الباقات غير متاح حالياً. يرجى التواصل مع المتجر للمساعدة.' : "Bundle returns aren't available yet. Please contact the store for assistance.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: locale === 'ar' ? 'طلب إرجاع' : 'Request a return' })).not.toBeInTheDocument();
  });
  it.each(['en', 'ar'] as const)('shows only paid goodwill with neutral wording and amount in %s', locale => {
    render(<OrderDetailCard locale={locale} order={{ ...baseOrder, goodwillRefunds: [
      { id: 'g1', amount: 10, status: 'PAID', reason: 'Private service dispute', payout: { payerName: 'Private cashier' } as never },
      { id: 'g2', amount: 5, status: 'OWED', reason: 'Owed private reason' },
      { id: 'g3', amount: 3, status: 'CANCELLED', reason: 'Cancelled private reason' },
    ] }} />);
    const visible = screen.getByText(locale === 'en' ? /Refund from the store:/ : /استرداد من المتجر:/);
    expect(visible.textContent).toBe(`${locale === 'en' ? 'Refund from the store' : 'استرداد من المتجر'}: ${formatCurrency(10, locale)}`);
    expect(screen.queryByText(/Private|private/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$5.00|\$3.00/)).not.toBeInTheDocument();
  });
  it('displays return and marking indicators independently of delivery status', () => {
    render(<OrderDetailCard locale="en" order={{ ...baseOrder, returnIndicators: {
      returnStatus: 'PARTIALLY_RETURNED', refundStatus: 'PARTIALLY_MARKED', hasReturn: true,
      orderedUnits: 4, originalMerchandiseCents: 8000, activeReturns: 2, inProgressReturns: 1,
      inProgressUnits: 1, pendingRefundCents: 2000, physicallyReturnedUnits: 1,
      awaitingMarkingReturns: 0, awaitingMarkingCents: 0, markedReturns: 1, markedUnits: 1, markedRefundCents: 2000,
    } }} />);
    expect(screen.getByText('Partially returned · 1 of 4 units')).toBeInTheDocument();
    expect(screen.getByText('Refunded: $20.00 of $80.00')).toBeInTheDocument();
    expect(screen.getByText('Return in progress: 1 units · pending amount $20.00')).toBeInTheDocument();
  });
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

const calculation: RefundCalculation = {
  version: 1, method: 'KEPT_QUANTITY', originalQuantity: 7, returnedQuantity: 3, keptQuantity: 4,
  originalNetCents: 5600, keptGrossCents: 4000, keptNetCents: 4000,
  couponDiscountCents: 0, couponBasisCents: 5600, proportionalRefundCents: 2400,
  quantityDiscountAdjustmentCents: 800, cumulativeRefundCents: 1600, previousRefundCents: 0, reservedRefundCents: 0, refundCents: 1600,
};
const volumeOrder: Order = { ...baseOrder, subtotal: 56, total: 56, items: [{ ...baseOrder.items[0],
  quantity: 7, returnedQuantity: 0, unitPrice: 8, lineTotal: 56,
  priceBreakdown: { version: 2, rule: { id: 'rule' }, couponDiscountCents: 0 } }] };
const refundPreview: ReturnPreview = { refundCents: 1600, items: [{ orderItemID: 'oi1', productName: 'Test Shirt', quantity: 3,
  refundCents: 1600, refundBreakdown: calculation }] };

describe('quantity-discount return disclosure', () => {
  it('requires a preview, displays the adjustment, and invalidates it when quantity changes', async () => {
    const user = userEvent.setup();
    const preview = vi.fn().mockResolvedValue(refundPreview);
    const submit = vi.fn();
    render(<OrderDetailCard locale="en" order={volumeOrder} onPreviewReturn={preview} onRequestReturn={submit} />);
    expect(screen.getByText(/Partial returns can reduce your quantity discount/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request a return' }));
    await user.click(screen.getByRole('checkbox', { name: /Test Shirt/ }));
    for (let n = 0; n < 4; n++) await user.click(screen.getByRole('button', { name: /Decrease/ }));
    expect(screen.getByRole('button', { name: 'Submit return request' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Preview refund' }));
    const adjustment = await screen.findByText('Quantity-discount adjustment (deducted)');
    expect(within(adjustment.parentElement!).getByText('$8.00')).toBeInTheDocument();
    expect(preview).toHaveBeenCalledWith({ items: [{ orderItemID: 'oi1', quantity: 3 }], reason: undefined });
    expect(screen.getByText('Price of 4 kept unit(s), before coupon')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit return request' }));
    expect(submit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Decrease/ }));
    expect(screen.queryByText('Quantity-discount adjustment (deducted)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit return request' })).toBeDisabled();
  });
  it('shows preview errors and never submits without a successful preview', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<OrderDetailCard locale="en" order={volumeOrder} onPreviewReturn={vi.fn().mockRejectedValue(new Error('Resolve existing return'))} onRequestReturn={submit} />);
    await user.click(screen.getByRole('button', { name: 'Request a return' }));
    await user.click(screen.getByRole('checkbox', { name: /Test Shirt/ }));
    await user.click(screen.getByRole('button', { name: 'Preview refund' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Resolve existing return');
    expect(screen.getByRole('button', { name: 'Submit return request' })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('displays the saved adjustment after approval in the shared read-only view', () => {
    const order: Order = { ...volumeOrder, returns: [{ id: 'r', orderID: 'o1', status: 'APPROVED', refundAmount: 16, dateCreated: '',
      items: [{ id: 'ri', returnID: 'r', orderItemID: 'oi1', quantity: 3, refundAmount: 16, refundBreakdown: calculation }] }] };
    render(<OrderDetailCard locale="en" order={order} />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(within(screen.getByText('Quantity-discount adjustment (deducted)').parentElement!).getByText('$8.00')).toBeInTheDocument();
    expect(within(screen.getByText('Refund for this request').parentElement!).getByText('$16.00')).toBeInTheDocument();
  });
  it('blocks another return while this discounted line has an unresolved return', () => {
    const order: Order = { ...volumeOrder, returns: [{ id: 'r', orderID: 'o1', status: 'RECEIVED', dateCreated: '',
      items: [{ id: 'ri', returnID: 'r', orderItemID: 'oi1', quantity: 3, refundAmount: 16 }] }] };
    render(<OrderDetailCard locale="en" order={order} onRequestReturn={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
    expect(screen.getByText(/Finish or withdraw the existing return/)).toBeInTheDocument();
  });
  it('makes a zero-refund result explicit before submission', async () => {
    const user = userEvent.setup();
    const zero = { ...refundPreview, refundCents: 0, items: [{ ...refundPreview.items[0], refundCents: 0,
      refundBreakdown: { ...calculation, refundCents: 0 } }] };
    render(<OrderDetailCard locale="en" order={volumeOrder} onPreviewReturn={vi.fn().mockResolvedValue(zero)} onRequestReturn={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Request a return' }));
    await user.click(screen.getByRole('checkbox', { name: /Test Shirt/ }));
    await user.click(screen.getByRole('button', { name: 'Preview refund' }));
    expect(await screen.findByText('This return has no refundable amount after the quantity-discount adjustment.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit return request' })).toBeEnabled());
  });
});
