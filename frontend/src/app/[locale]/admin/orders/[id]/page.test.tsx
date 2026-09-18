import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', id: 'o1' }) }));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));

vi.mock('@/lib/api', () => ({
  ordersApi: {
    getOrder: vi.fn(),
    adminUpdateOrderStatus: vi.fn(),
    adminMarkCollected: vi.fn(),
    adminReviewOrder: vi.fn(),
  },
  isApiError: (e: unknown) => e instanceof Error && 'code' in e,
}));

import { ordersApi } from '@/lib/api';
import AdminOrderDetailPage from './page';

const mock = vi.mocked(ordersApi, true);

const order = {
  id: 'o1',
  orderNumber: 'AS-20260906-ABC123',
  guestEmail: 'jane@test.dev',
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791111111',
  deliveryAddress: '123 Main St',
  deliveryCity: 'Amman',
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
    { id: 'i1', productName: 'Cotton Tee', size: 'M', color: 'Black', quantity: 2, lineTotal: 40 },
  ],
};

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(<AdminOrderDetailPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.getOrder.mockResolvedValue(order as never);
  mock.adminUpdateOrderStatus.mockResolvedValue({ ...order, status: 'CONFIRMED' } as never);
  mock.adminMarkCollected.mockResolvedValue({ ...order, paymentStatus: 'COLLECTED' } as never);
  mock.adminReviewOrder.mockResolvedValue({ ...order, flaggedForReview: false } as never);
});

describe('AdminOrderDetailPage (fix-list.md #4, resolves 2.2)', () => {
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

  it('"Mark collected" toggles COD payment status', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });

    await user.click(screen.getByRole('button', { name: 'Mark collected' }));
    await waitFor(() => expect(mock.adminMarkCollected).toHaveBeenCalledWith('o1', true));
  });

  it('shows a "Mark reviewed" action for a flagged order, which clears the flag', async () => {
    mock.getOrder.mockResolvedValue({ ...order, flaggedForReview: true } as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });

    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(mock.adminReviewOrder).toHaveBeenCalledWith('o1'));
  });
});
