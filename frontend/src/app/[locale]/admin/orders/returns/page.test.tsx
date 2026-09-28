import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeAuthedStore } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en' }) }));

vi.mock('@/lib/api', () => ({
  returnsApi: {
    adminListReturns: vi.fn(),
    adminUpdateReturnStatus: vi.fn(),
  },
  isApiError: (e: unknown) => e instanceof Error && 'code' in e,
}));

import { returnsApi } from '@/lib/api';
import AdminReturnsPage from './page';

const mock = vi.mocked(returnsApi, true);

const ret = {
  id: 'r1',
  orderID: 'o1',
  status: 'REQUESTED' as const,
  reason: 'Wrong size',
  refundAmount: '40.00',
  dateCreated: '2026-09-01T00:00:00.000Z',
  order: {
    orderNumber: 'AS-20260901-AAA111',
    deliveryName: 'Jane Doe',
    deliveryPhone: '0791111111',
    guestEmail: null,
    status: 'DELIVERED' as const,
  },
  items: [
    {
      id: 'ri1',
      returnID: 'r1',
      orderItemID: 'oi1',
      quantity: 2,
      refundAmount: '40.00',
      orderItem: { id: 'oi1', productName: 'Test Shirt', variantSKU: 'SKU-1', size: 'M', color: null, quantity: 4 },
    },
  ],
};

function renderPage(permissions = ['orders:view', 'orders:manage', 'payments:manage']) {
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions }));
  return render(<AdminReturnsPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.adminListReturns.mockResolvedValue([ret] as never);
  mock.adminUpdateReturnStatus.mockResolvedValue({ ...ret, status: 'APPROVED' } as never);
});

describe('AdminReturnsPage', () => {
  it.each([{ permissions: ['orders:view', 'orders:manage'] }, { permissions: ['orders:view', 'payments:manage'] }])('hides marking without both manage permissions (%j)', async ({ permissions }) => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status: 'RECEIVED' }] as never);
    renderPage(permissions); await screen.findByText('AS-20260901-AAA111');
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });
  it('opens the shared dialog and sends the adjusted amounts from the Returns page', async () => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status: 'RECEIVED', refundEligibility: {
      amountCents: 4000, remainingRefundableCents: 5000, remainingDeliveryRefundableCents: 1000,
      remainingTotalRefundableCents: 6000, collectionCount: 1, blockReason: null,
    } }] as never);
    const user = userEvent.setup(); renderPage(); await screen.findByText('AS-20260901-AAA111');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark refunded' }));
    await user.clear(screen.getByLabelText('Merchandise amount marked refunded (USD)'));
    await user.type(screen.getByLabelText('Merchandise amount marked refunded (USD)'), '30');
    await user.type(screen.getByLabelText('Adjustment reason'), 'Restocking fee');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark refunded' }));
    expect(mock.adminUpdateReturnStatus).toHaveBeenCalledWith('r1', 'REFUNDED', {
      merchandiseRefundCents: 3000, refundAdjustmentReason: 'Restocking fee', deliveryRefundCents: 0, deliveryRefundReason: undefined,
    });
  });
  it('hides return actions from orders:view-only staff', async () => {
    renderPage(['orders:view']); await screen.findByText('AS-20260901-AAA111');
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });
  it('shows the collection block reason but allows opening the amount dialog', async () => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status: 'RECEIVED', refundEligibility: {
      amountCents: 4000, remainingRefundableCents: 1000, remainingDeliveryRefundableCents: 0, remainingTotalRefundableCents: 1000, collectionCount: 1, blockReason: 'EXCEEDS_REMAINING_REFUNDABLE',
    } }] as never);
    const user = userEvent.setup(); renderPage();
    await screen.findByText(/Amount exceeds remaining refundable/);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Mark refunded' })).toBeEnabled();
    expect(mock.adminUpdateReturnStatus).not.toHaveBeenCalled();
  });
  it('lists a return with its order, refund amount, and status', async () => {
    renderPage();
    expect(await screen.findByText('AS-20260901-AAA111')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('$40.00')).toBeInTheDocument();
    expect(document.querySelector('.status--pending')).toHaveTextContent('Requested');
  });

  it('approving a REQUESTED return opens a confirm dialog and calls the mutation', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AS-20260901-AAA111');

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Approve' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(mock.adminUpdateReturnStatus).toHaveBeenCalledWith('r1', 'APPROVED');
  });

  it('a REJECTED return has no further actions available', async () => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status: 'REJECTED' }] as never);
    renderPage();
    await screen.findByText('AS-20260901-AAA111');
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });
});
