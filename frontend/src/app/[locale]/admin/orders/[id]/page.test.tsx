import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', id: 'o1' }) }));

vi.mock('@/lib/api', () => ({
  ordersApi: { getOrder: vi.fn() },
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

  it('never renders a Cancel button — status changes stay on the list page', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'AS-20260906-ABC123' });
    expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument();
  });

  it('shows a retryable error state when the order fails to load', async () => {
    mock.getOrder.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText("Couldn't load this order")).toBeInTheDocument();
  });
});
