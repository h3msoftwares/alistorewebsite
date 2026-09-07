import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en' }) }));

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

function renderPage() {
  const { Wrapper } = createWrapper();
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
  it('renders a row with the order number, customer and total', async () => {
    renderPage();
    expect(await screen.findByText('AS-20260906-ABC123')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/jane@test\.dev/)).toBeInTheDocument();
    expect(screen.getByText('$43.00')).toBeInTheDocument();
  });

  it('changing the row status select calls the update mutation', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.selectOptions(
      screen.getByRole('combobox', { name: /change status for AS-20260906-ABC123/i }),
      'SHIPPED'
    );
    await waitFor(() => expect(mock.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'SHIPPED'));
  });

  it('"Mark collected" toggles COD payment status', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.click(screen.getByRole('button', { name: 'Mark collected' }));
    await waitFor(() =>
      expect(mock.adminMarkCollected).toHaveBeenCalledWith('o1', true)
    );
  });

  it('filtering by status refetches with that status', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.selectOptions(screen.getByRole('combobox', { name: /filter by status/i }), 'DELIVERED');
    await waitFor(() => expect(mock.adminListOrders).toHaveBeenLastCalledWith('DELIVERED', undefined));
  });

  it('"Flagged only" checkbox refetches with flagged=true', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    await user.click(screen.getByRole('checkbox', { name: /flagged only/i }));
    await waitFor(() => expect(mock.adminListOrders).toHaveBeenLastCalledWith(undefined, true));
  });

  it('shows a Flagged badge and a "Mark reviewed" button for a flagged order, which clears the flag', async () => {
    mock.adminListOrders.mockResolvedValue([{ ...order, flaggedForReview: true }] as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260906-ABC123');

    expect(screen.getByText('Flagged')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(mock.adminReviewOrder).toHaveBeenCalledWith('o1'));
  });

  it('shows an empty state when there are no orders', async () => {
    mock.adminListOrders.mockResolvedValue([] as never);
    renderPage();
    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });
});
