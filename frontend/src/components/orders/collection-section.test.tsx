import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeAuthedStore } from '@/test/utils';
import { CollectionSection } from './collection-section';
import type { OrderActionsApi } from '@/hooks/use-order-actions';
import type { CollectionSummary, Order } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  ordersApi: { adminCollectionSummary: vi.fn(), adminMarkCollected: vi.fn() },
  returnsApi: { adminUpdateReturnStatus: vi.fn() },
  isApiError: (error: unknown) => error instanceof Error && 'code' in error,
}));
import { ordersApi, returnsApi } from '@/lib/api';
const mock = vi.mocked(ordersApi, true);
const order = { id: 'o1', currency: 'USD', paymentMethod: 'COD', returns: [
  { id: 'r1', status: 'RECEIVED', items: [{ id: 'ri1', quantity: 1, refundAmount: 30 }] },
] } as Order;
const record = { id: 'c1', orderID: 'o1', actorID: 'a1', actorName: 'Admin', amount: 110, currency: 'USD',
  collectedAt: '2026-09-28T12:00:00Z', createdAt: '2026-09-28T12:05:00Z', collectorName: 'Alice', reference: 'Receipt 1', reversalOfID: null };
const summary: CollectionSummary = { currency: 'USD', expectedTotalCents: 11000, deliveryFeeCents: 1000,
  collectedCents: 11000, markedRefundedCents: 3000, remainingRefundableCents: 7000, collectionCount: 1, records: [record] };
const run = vi.fn(async (_id, fn) => fn());
const oa = { run, busyId: null } as unknown as OrderActionsApi;
function show(permissions = ['orders:view', 'orders:manage', 'payments:manage'], locale: 'en' | 'ar' = 'en') {
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions }));
  return render(<CollectionSection order={order} locale={locale} oa={oa} />, { wrapper: Wrapper });
}
beforeEach(() => {
  vi.clearAllMocks(); mock.adminCollectionSummary.mockResolvedValue(summary);
  mock.adminMarkCollected.mockResolvedValue({ id: 'o1' } as never);
  vi.mocked(returnsApi.adminUpdateReturnStatus).mockResolvedValue({ id: 'r1' } as never);
});

describe('COD Collection section', () => {
  it('shows evidence and merchandise cap with delivery-first explanation', async () => {
    show(); await screen.findByText('Receipt / reference: Receipt 1');
    expect(screen.getByText('$70.00')).toBeInTheDocument();
    expect(screen.getByText(/Collector: Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Recorded by: Admin/)).toBeInTheDocument();
    expect(screen.getByText(/Delivery fees are treated as collected first/)).toBeInTheDocument();
  });
  it('orders:manage alone may read and mark, but cannot record or correct a collection', async () => {
    show(['orders:manage', 'orders:view']); await screen.findByText('Receipt / reference: Receipt 1');
    expect(screen.queryByRole('button', { name: 'Record collection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct collection' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark refunded' })).toBeEnabled();
  });
  it('payments:view alone reads history and hides all write controls', async () => {
    show(['payments:view']); await screen.findByText('Receipt / reference: Receipt 1');
    expect(screen.queryByRole('button', { name: 'Record collection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct collection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark refunded' })).not.toBeInTheDocument();
  });
  it('submits required evidence through the shared fresh-auth action runner', async () => {
    const user = userEvent.setup(); show(); await screen.findByRole('button', { name: 'Record collection' });
    await user.type(screen.getByLabelText('Amount (USD)'), '25.50');
    fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: '2026-09-28T12:00' } });
    await user.type(screen.getByLabelText('Collector / courier name'), 'Courier Bob');
    await user.type(screen.getByLabelText('Receipt / reference (optional)'), 'R-25');
    await user.click(screen.getByRole('button', { name: 'Record collection' }));
    await waitFor(() => expect(mock.adminMarkCollected).toHaveBeenCalledWith('o1', {
      collected: true, amount: 25.5, currency: 'USD', collectedAt: new Date('2026-09-28T12:00').toISOString(),
      collectorName: 'Courier Bob', reference: 'R-25', note: undefined,
    }));
    expect(run).toHaveBeenCalled();
  });
  it.each(['', '   '])('allows reference %j to be blank and submits null while keeping collector required', async (reference) => {
    const user = userEvent.setup(); show();
    const button = await screen.findByRole('button', { name: 'Record collection' });
    const referenceInput = screen.getByLabelText('Receipt / reference (optional)');
    expect(referenceInput).not.toBeRequired();
    expect(screen.getByLabelText('Collector / courier name')).toBeRequired();
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Amount (USD)'), '25.50');
    fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: '2026-09-28T12:00' } });
    await user.type(screen.getByLabelText('Collector / courier name'), 'Courier Bob');
    if (reference) await user.type(referenceInput, reference);
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(mock.adminMarkCollected).toHaveBeenCalledWith('o1', expect.objectContaining({ reference: null, collectorName: 'Courier Bob' })));
  });
  it('shows a null reference as not provided', async () => {
    mock.adminCollectionSummary.mockResolvedValue({ ...summary, records: [{ ...record, reference: null }] });
    show();
    expect(await screen.findByText('Receipt / reference: Not provided')).toBeInTheDocument();
  });
  it('requires a reason to append a full reversal, never edits the original', async () => {
    const user = userEvent.setup(); show(); await user.click(await screen.findByRole('button', { name: 'Correct collection' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Record correction' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Correction reason'), 'Duplicate receipt');
    await user.click(within(dialog).getByRole('button', { name: 'Record correction' }));
    await waitFor(() => expect(mock.adminMarkCollected).toHaveBeenCalledWith('o1', { collected: false, collectionID: 'c1', reason: 'Duplicate receipt' }));
  });
  it.each(['en', 'ar'] as const)('shows the missing evidence reason and disables marking in %s', async (locale) => {
    mock.adminCollectionSummary.mockResolvedValue({ ...summary, records: [], collectionCount: 0, collectedCents: 0, remainingRefundableCents: 0 });
    show(undefined, locale);
    const button = await screen.findByRole('button', { name: locale === 'en' ? 'Mark refunded' : 'وضع علامة استرداد' });
    expect(button).toBeDisabled();
    expect(screen.getByText(locale === 'en' ? /No COD collection recorded/ : /لم يُسجّل تحصيل الدفع/)).toBeInTheDocument();
  });
  it('shows an over-cap reason and requires confirmation for an allowed marking', async () => {
    mock.adminCollectionSummary.mockResolvedValue({ ...summary, remainingRefundableCents: 2000 });
    const view = show();
    expect(await screen.findByRole('button', { name: 'Mark refunded' })).toBeDisabled();
    expect(screen.getByText(/Amount exceeds remaining refundable/)).toBeInTheDocument();
    view.unmount(); mock.adminCollectionSummary.mockResolvedValue(summary);
    const user = userEvent.setup(); show();
    await user.click(await screen.findByRole('button', { name: 'Mark refunded' }));
    expect(returnsApi.adminUpdateReturnStatus).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark refunded' }));
    await waitFor(() => expect(returnsApi.adminUpdateReturnStatus).toHaveBeenCalledWith('r1', 'REFUNDED'));
  });
});
