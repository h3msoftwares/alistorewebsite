import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeAuthedStore } from '@/test/utils';

const mockPush = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => mockSearchParams(),
}));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));

vi.mock('@/lib/api', () => ({
  ordersApi: {
    adminListOrders: vi.fn(),
    adminUpdateOrderStatus: vi.fn(),
    adminMarkCollected: vi.fn(),
    adminReviewOrder: vi.fn(),
  },
}));

import { ordersApi } from '@/lib/api';
import AdminOrdersPage from './page';

const mock = vi.mocked(ordersApi, true);

const order = {
  id: 'o1',
  orderNumber: 'AS-20260906-ABC123',
  guestEmail: 'jane@test.dev',
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791111111',
  subtotal: 40,
  deliveryFee: 3,
  total: 43,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  status: 'PENDING',
  dateCreated: '2026-09-06T10:00:00.000Z',
  items: [{ id: 'i1', quantity: 2 }],
};

function renderPage(permissions = ['orders:view', 'orders:manage', 'payments:view', 'payments:manage', 'returns:view', 'returns:manage']) {
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions }));
  return render(<AdminOrdersPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.adminListOrders.mockResolvedValue([order] as never);
  mock.adminUpdateOrderStatus.mockResolvedValue({ ...order, status: 'CONFIRMED' } as never);
  mock.adminMarkCollected.mockResolvedValue({ ...order, paymentStatus: 'COLLECTED' } as never);
  mock.adminReviewOrder.mockResolvedValue({ ...order, flaggedForReview: false } as never);
});

describe('AdminOrdersPage', () => {
  it.each([['orders:view', 'orders:manage'], ['orders:view', 'returns:manage']])('hides whole-order return without both permissions (%j)', async (...permissions) => {
    renderPage(permissions);
    const select = await screen.findByRole('combobox', { name: /change status/i });
    expect(within(select).queryByRole('option', { name: 'RETURNED' })).not.toBeInTheDocument();
  });
  it('passes the independent return filter to the list API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(order.orderNumber);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by return or marking status' }), 'REFUND_DUE');
    await waitFor(() => expect(mock.adminListOrders).toHaveBeenLastCalledWith(undefined, undefined, undefined, 'REFUND_DUE'));
  });
  it('seeds a dashboard return filter from the URL', async () => {
    mockSearchParams.mockReturnValueOnce(new URLSearchParams('returnFilter=MARKED_REFUNDED'));
    renderPage();
    await waitFor(() => expect(mock.adminListOrders).toHaveBeenLastCalledWith(undefined, undefined, undefined, 'MARKED_REFUNDED'));
  });
  it('renders a row with the order number, customer and total', async () => {
    renderPage();
    expect(await screen.findByText('AS-20260906-ABC123')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/jane@test\.dev/)).toBeInTheDocument();
    expect(screen.getByText('$43.00')).toBeInTheDocument();
  });

  const selectStatus = (user: ReturnType<typeof userEvent.setup>, value: string) =>
    user.selectOptions(
      screen.getByRole('combobox', { name: /change status for AS-20260906-ABC123/i }),
      value
    );

  it('a plain status change applies immediately with no modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await selectStatus(user, 'CONFIRMED');
    await waitFor(() =>
      expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'CONFIRMED', undefined)
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moving an order to SHIPPED opens the estimate modal and passes the number through', async () => {
    mock.adminListOrders.mockResolvedValue([{ ...order, status: 'CONFIRMED' }] as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await selectStatus(user, 'SHIPPED');
    const dialog = await screen.findByRole('dialog');
    expect(mock.adminUpdateOrderStatus).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('spinbutton', { name: /arrives in about/i }), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Ship order' }));

    await waitFor(() =>
      expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'SHIPPED', 3)
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shipping with a blank estimate sends null and closes the modal', async () => {
    mock.adminListOrders.mockResolvedValue([{ ...order, status: 'CONFIRMED' }] as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await selectStatus(user, 'SHIPPED');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ship order' }));

    await waitFor(() =>
      expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'SHIPPED', null)
    );
  });

  it('closing the estimate modal aborts the status change', async () => {
    mock.adminListOrders.mockResolvedValue([{ ...order, status: 'CONFIRMED' }] as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await selectStatus(user, 'SHIPPED');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(mock.adminUpdateOrderStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('changing status to CANCELLED asks for confirmation before applying', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await selectStatus(user, 'CANCELLED');
    const dialog = await screen.findByRole('dialog');
    expect(mock.adminUpdateOrderStatus).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    await waitFor(() =>
      expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'CANCELLED', undefined)
    );
  });

  it('"Keep as is" in the confirm modal leaves the order untouched', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await selectStatus(user, 'RETURNED');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Keep as is' }));

    expect(mock.adminUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it('"Collection records" opens the order evidence section', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.click(screen.getByRole('button', { name: /more actions for AS-20260906-ABC123/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Collection records' }));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/en/admin/orders/o1#collection')
    );
  });

  it('filtering by status refetches with that status', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.selectOptions(screen.getByRole('combobox', { name: /filter by status/i }), 'DELIVERED');
    await waitFor(() => expect(mock.adminListOrders).toHaveBeenLastCalledWith(['DELIVERED'], undefined, undefined, undefined));
  });

  it('"Flagged only" checkbox refetches with flagged=true', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.click(screen.getByRole('checkbox', { name: /flagged only/i }));
    await waitFor(() => expect(mock.adminListOrders).toHaveBeenLastCalledWith(undefined, true, undefined, undefined));
  });

  it('seeds status/flagged/awaitingCod filters from the URL (dashboard deep links)', async () => {
    mockSearchParams.mockReturnValueOnce(new URLSearchParams('status=CONFIRMED,SHIPPED'));
    renderPage();
    await waitFor(() =>
      expect(mock.adminListOrders).toHaveBeenLastCalledWith(['CONFIRMED', 'SHIPPED'], undefined, undefined, undefined)
    );
  });

  it('"Awaiting COD" checkbox refetches with awaitingCod=true', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.click(screen.getByRole('checkbox', { name: /awaiting cod/i }));
    await waitFor(() => expect(mock.adminListOrders).toHaveBeenLastCalledWith(undefined, undefined, true, undefined));
  });

  it('shows a Flagged badge and a "Mark reviewed" action for a flagged order, which clears the flag', async () => {
    mock.adminListOrders.mockResolvedValue([{ ...order, flaggedForReview: true }] as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    expect(screen.getByText('Flagged')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more actions for AS-20260906-ABC123/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark reviewed' }));
    await waitFor(() => expect(mock.adminReviewOrder).toHaveBeenCalledWith('o1'));
  });

  it('shows the coupon reduction under the total when the order used one', async () => {
    mock.adminListOrders.mockResolvedValue([
      { ...order, discountAmount: 8, couponCode: 'SAVE8' },
    ] as never);
    renderPage();
    await screen.findByText('AS-20260906-ABC123');
    expect(screen.getByText(/−\$8\.00 · SAVE8/)).toBeInTheDocument();
  });

  it('the estimate chip re-opens the modal, pre-filled, to revise the number', async () => {
    const user = userEvent.setup();
    mock.adminListOrders.mockResolvedValue([
      { ...order, status: 'SHIPPED', estimatedDeliveryDays: 4 },
    ] as never);
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.click(screen.getByRole('button', { name: '~4d' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByRole('spinbutton', { name: /arrives in about/i });
    expect(field).toHaveValue(4);

    await user.clear(field);
    await user.type(field, '5');
    await user.click(within(dialog).getByRole('button', { name: 'Save estimate' }));

    await waitFor(() =>
      expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'SHIPPED', 5)
    );
  });

  it('shows an empty state when there are no orders', async () => {
    mock.adminListOrders.mockResolvedValue([] as never);
    renderPage();
    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });
});
