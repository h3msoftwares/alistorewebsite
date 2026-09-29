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
import { bundleRefundCalculation } from '@/test/bundle-refund';

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

function renderPage(permissions = ['returns:view', 'returns:manage', 'refunds:view', 'refunds:manage']) {
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions }));
  return render(<AdminReturnsPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.adminListReturns.mockResolvedValue([ret] as never);
  mock.adminUpdateReturnStatus.mockResolvedValue({ ...ret, status: 'APPROVED' } as never);
});

describe('AdminReturnsPage', () => {
  it('shows the saved Bundle calculation in expanded return details for a viewer', async () => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, refundAmount: '10', items: [{ ...ret.items[0], orderItemID: 'a', quantity: 1, refundAmount: '10' }],
      bundleCalculations: [{ orderBundleID: 'group', calculation: bundleRefundCalculation }] }] as never);
    renderPage(['returns:view']);
    await screen.findByText('AS-20260901-AAA111');
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    expect(screen.getByText('Bundle discount lost')).toBeInTheDocument();
    expect(screen.getByText('Complete Bundles kept: 0 of 1.')).toBeInTheDocument();
  });
  it.each([{ permissions: ['returns:view', 'orders:manage'] }, { permissions: ['returns:view', 'payments:manage'] }, { permissions: ['returns:view', 'returns:manage'] }])('hides marking without refunds:manage (%j)', async ({ permissions }) => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status: 'RECEIVED' }] as never);
    renderPage(permissions); await screen.findByText('AS-20260901-AAA111');
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });
  it('opens the shared dialog and sends the adjusted amounts from the Returns page', async () => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status: 'RECEIVED', refundEligibility: {
      amountCents: 4000, remainingRefundableCents: 5000, remainingDeliveryRefundableCents: 1000,
      remainingTotalRefundableCents: 6000, collectionCount: 1, blockReason: null,
    } }] as never);
    const user = userEvent.setup(); renderPage(['returns:view', 'refunds:manage', 'refunds:view']); await screen.findByText('AS-20260901-AAA111');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark refunded' }));
    await user.clear(screen.getByLabelText('Merchandise amount refunded (USD)'));
    await user.type(screen.getByLabelText('Merchandise amount refunded (USD)'), '30');
    await user.type(screen.getByLabelText('Adjustment reason'), 'Restocking fee');
    await user.type(screen.getByLabelText('Paid by'), 'Cashier');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark refunded' }));
    expect(mock.adminUpdateReturnStatus).toHaveBeenCalledWith('r1', 'REFUNDED', {
      merchandiseRefundCents: 3000, refundAdjustmentReason: 'Restocking fee', deliveryRefundCents: 0, deliveryRefundReason: undefined,
      payout: { payerName: 'Cashier', paidOn: expect.any(String), reference: null, note: null },
    });
  });
  it('hides return actions from returns:view-only staff', async () => {
    renderPage(['returns:view']); await screen.findByText('AS-20260901-AAA111');
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

  it.each(['REQUESTED', 'APPROVED', 'IN_TRANSIT'])('hides physical handling of %s from a refund manager', async status => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status }] as never);
    renderPage(['returns:view', 'refunds:manage', 'refunds:view']);
    await screen.findByText('AS-20260901-AAA111');
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it.each([
    ['REQUESTED', ['Approve', 'Reject', 'Cancel request']],
    ['APPROVED', ['Mark in transit', 'Cancel request']],
    ['IN_TRANSIT', ['Mark received', 'Cancel request']],
  ])('shows physical handling of %s with returns:manage alone', async (status, labels) => {
    mock.adminListReturns.mockResolvedValue([{ ...ret, status }] as never);
    renderPage(['returns:manage', 'returns:view']);
    const user = userEvent.setup(); await screen.findByText('AS-20260901-AAA111');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    for (const label of labels) expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Mark refunded' })).not.toBeInTheDocument();
  });
});
