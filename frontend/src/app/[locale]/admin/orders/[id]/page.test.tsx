import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', id: 'o1' }) }));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));
vi.mock('@/lib/api/refunds', () => ({ summary: vi.fn(async () => ({ collectionCount: 0, goodwillReservedCents: 0,
  remainingTotalRefundableCents: 0, payouts: [], goodwillRefunds: [] })) }));
const permissions = vi.hoisted(() => ({ correct: false, keys: [] as string[] }));
vi.mock('@/lib/rbac', () => ({ usePermissions: () => ({ has: (key: string) => permissions.correct || permissions.keys.includes(key) }) }));

vi.mock('@/lib/api', () => ({
  ordersApi: {
    getOrder: vi.fn(),
    adminUpdateOrderStatus: vi.fn(),
    adminMarkCollected: vi.fn(),
    adminCollectionSummary: vi.fn(),
    adminReviewOrder: vi.fn(),
    adminCorrectOrderStatus: vi.fn(),
  },
  returnsApi: {
    adminRequestReturn: vi.fn(),
    adminPreviewReturn: vi.fn(),
  },
  isApiError: (e: unknown) => e instanceof Error && 'code' in e,
}));

import { ordersApi, returnsApi } from '@/lib/api';
import AdminOrderDetailPage from './page';

const mock = vi.mocked(ordersApi, true);
const returnsMock = vi.mocked(returnsApi, true);

const order = {
  id: 'o1',
  orderNumber: 'AS-20260906-ABC123',
  guestEmail: 'jane@test.dev',
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791111111',
  deliveryAddress: '123 Main St',
  deliveryCity: 'Amman',
  currency: 'USD',
  subtotal: 40,
  deliveryFee: 3,
  discountAmount: 0,
  total: 43,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  status: 'PENDING',
  flaggedForReview: false,
  dateCreated: '2026-09-06T10:00:00.000Z',
  items: [
    { id: 'i1', productName: 'Cotton Tee', size: 'M', color: 'Black', quantity: 2, returnedQuantity: 0, lineTotal: 40 },
  ],
};

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(<AdminOrderDetailPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  permissions.correct = false;
  permissions.keys = [];
  vi.clearAllMocks();
  mock.getOrder.mockResolvedValue(order as never);
  mock.adminUpdateOrderStatus.mockResolvedValue({ ...order, status: 'CONFIRMED' } as never);
  mock.adminMarkCollected.mockResolvedValue({ ...order, paymentStatus: 'COLLECTED' } as never);
  mock.adminCollectionSummary.mockResolvedValue({ expectedTotalCents: 4300, collectedCents: 0, remainingRefundableCents: 0, markedRefundedCents: 0, collectionCount: 0, deliveryFeeCents: 300, currency: 'USD', records: [], markedDeliveryRefundedCents: 0, remainingDeliveryRefundableCents: 0, remainingTotalRefundableCents: 0 });
  mock.adminReviewOrder.mockResolvedValue({ ...order, flaggedForReview: false } as never);
  mock.adminCorrectOrderStatus.mockResolvedValue(order as never);
  returnsMock.adminPreviewReturn.mockResolvedValue({ refundCents: 4000, items: [{ orderItemID: 'i1', productName: 'Cotton Tee', quantity: 2, refundCents: 4000 }] });
  returnsMock.adminRequestReturn.mockResolvedValue({ id: 'r1' } as never);
});

describe('AdminOrderDetailPage (fix-list.md #4, resolves 2.2)', () => {
  it('keeps items visible after recording collection while the full order reloads', async () => {
    permissions.correct = true;
    const fields = Object.fromEntries(Object.entries(order).filter(([key]) => key !== 'items'));
    mock.adminMarkCollected.mockResolvedValue({ ...fields, paymentStatus: 'COLLECTED' } as never);
    mock.getOrder.mockResolvedValueOnce(order as never).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup(); renderPage();
    await screen.findByRole('button', { name: 'Record collection' });
    await user.type(screen.getByLabelText('Amount (USD)'), '43');
    fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: '2026-09-28T12:00' } });
    await user.type(screen.getByLabelText('Collector / courier name'), 'Courier');
    await user.type(screen.getByLabelText('Receipt / reference (optional)'), 'Receipt 1');
    await user.click(screen.getByRole('button', { name: 'Record collection' }));
    await waitFor(() => expect(mock.getOrder).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/Cotton Tee/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: order.orderNumber })).toBeInTheDocument();
  });
  it('offers only the next normal fulfillment step and hides correction without permission', async () => {
    mock.getOrder.mockResolvedValue({ ...order, status: 'SHIPPED' } as never);
    renderPage();
    const select = await screen.findByRole('combobox', { name: /change status/i });
    expect(within(select).queryByRole('option', { name: 'PENDING' })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'CONFIRMED' })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'DELIVERED' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct status' })).not.toBeInTheDocument();
  });

  it('uses a distinct correction action with a required reason and the displayed prior status', async () => {
    permissions.correct = true;
    mock.getOrder.mockResolvedValue({ ...order, status: 'DELIVERED' } as never);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Correct status' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Corrected status' }), 'PENDING');
    const apply = screen.getByRole('button', { name: 'Apply correction' });
    expect(apply).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Reason for correction' }), 'Clicked the wrong order');
    await user.click(apply);
    await waitFor(() => expect(mock.adminCorrectOrderStatus).toHaveBeenCalledWith('o1', {
      status: 'PENDING', expectedStatus: 'DELIVERED', reason: 'Clicked the wrong order',
    }));
    expect(mock.adminUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['Mark reviewed', 'adminReviewOrder', { flaggedForReview: false }],
  ] as const)('keeps order items visible after %s while the full order reloads', async (label, endpoint, changes) => {
    const loadedOrder = { ...order, flaggedForReview: true };
    // These endpoints return scalar order fields, without the items relation.
    const summary = Object.fromEntries(Object.entries(loadedOrder).filter(([key]) => key !== 'items'));
    mock[endpoint].mockResolvedValue({ ...summary, ...changes } as never);
    mock.getOrder.mockResolvedValueOnce(loadedOrder as never)
      .mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: order.orderNumber });

    await user.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(mock.getOrder).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { level: 1, name: order.orderNumber })).toBeInTheDocument();
    expect(screen.getByText(/Cotton Tee/)).toBeInTheDocument();
  });

  it('shows the order number and its actual line items — the gap this page closes', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' })).toBeInTheDocument();
    // The list page only ever showed a quantity count; this page shows what
    // was actually ordered.
    expect(screen.getByText(/Cotton Tee \(M \/ Black\) × 2/)).toBeInTheDocument();
    expect(mock.getOrder).toHaveBeenCalledWith('o1');
  });

  it('shows a flagged badge with its reason when the order is flagged', async () => {
    mock.getOrder.mockResolvedValue({ ...order, flaggedForReview: true, flaggedReason: 'velocity:phone' } as never);
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });
    expect(screen.getByText(/Flagged.*velocity:phone/)).toBeInTheDocument();
  });

  it('never renders OrderDetailCard\'s customer-facing Cancel button — admin cancellation goes through the status Select instead', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });
    // OrderDetailCard only ever renders its own "Cancel order" button when an
    // `onCancel` prop is passed — this page still never passes one, since
    // that button's PENDING/CONFIRMED-only gate is the customer/guest rule,
    // not the admin one. The confirm modal's own "Cancel order" button (see
    // the CANCELLED test below) only exists once that flow is opened.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument();
  });

  it('shows a retryable error state when the order fails to load', async () => {
    mock.getOrder.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText("Couldn't load this order")).toBeInTheDocument();
  });

  it('has a real Actions panel: a plain status change applies with no modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });

    await user.selectOptions(screen.getByRole('combobox', { name: /change status for AS-20260906-ABC123/i }), 'CONFIRMED');
    await waitFor(() => expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'CONFIRMED', undefined));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('changing status to CANCELLED asks for confirmation before applying', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });

    await user.selectOptions(screen.getByRole('combobox', { name: /change status for AS-20260906-ABC123/i }), 'CANCELLED');
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'CANCELLED', undefined));
  });

  it('hides collection controls without payments permission', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: order.orderNumber });
    expect(screen.queryByRole('button', { name: 'Mark collected' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record collection' })).not.toBeInTheDocument();
  });

  it('shows a "Mark reviewed" action for a flagged order, which clears the flag', async () => {
    mock.getOrder.mockResolvedValue({ ...order, flaggedForReview: true } as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });

    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(mock.adminReviewOrder).toHaveBeenCalledWith('o1'));
  });

  it('lets staff request a per-item return for a delivered order (e.g. a phone order)', async () => {
    permissions.keys = ['returns:manage', 'returns:view'];
    mock.getOrder.mockResolvedValue({ ...order, status: 'DELIVERED' } as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });

    await user.click(screen.getByRole('button', { name: 'Request a return' }));
    await user.click(screen.getByRole('checkbox', { name: /Cotton Tee \(M \/ Black\)/ }));
    await user.click(screen.getByRole('button', { name: 'Preview refund' }));
    await screen.findByText('Total refund');
    await user.click(screen.getByRole('button', { name: 'Submit return request' }));

    await waitFor(() =>
      expect(returnsMock.adminRequestReturn).toHaveBeenCalledWith('o1', {
        items: [{ orderItemID: 'i1', quantity: 2 }],
        reason: undefined,
        expectedRefundCents: 4000,
      })
    );
  });

  it.each([['orders:view', 'orders:manage'], ['orders:view', 'refunds:manage'], ['orders:view', 'returns:view']])('hides create return and whole-order return without handling permission (%j)', async (...keys) => {
    permissions.keys = keys;
    mock.getOrder.mockResolvedValue({ ...order, status: 'DELIVERED' } as never);
    renderPage(); await screen.findByRole('heading', { level: 1, name: order.orderNumber });
    expect(screen.queryByRole('button', { name: 'Request a return' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'RETURNED' })).not.toBeInTheDocument();
  });

  it('hides RETURNED in correction options without returns:manage', async () => {
    permissions.keys = ['orders:view', 'orders:manage', 'order_corrections:manage'];
    renderPage(); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Correct status' }));
    expect(within(screen.getByRole('combobox', { name: 'Corrected status' })).queryByRole('option', { name: 'RETURNED' })).not.toBeInTheDocument();
  });
});
