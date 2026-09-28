import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeAuthedStore } from '@/test/utils';
import { GoodwillDialog, RefundsSection } from './refunds-section';
import * as refunds from '@/lib/api/refunds';
import type { OrderActionsApi } from '@/hooks/use-order-actions';
import type { Order, RefundSummary } from '@/lib/types';

vi.mock('@/lib/api/refunds', () => ({ summary: vi.fn(), create: vi.fn(), pay: vi.fn(), cancel: vi.fn() }));
const owed = { id: 'g1', amount: 10, status: 'OWED' as const, reason: 'Service issue', payout: null };
const summary: RefundSummary = { collectionCount: 1, goodwillReservedCents: 2000, remainingTotalRefundableCents: 5000,
  goodwillRefunds: [owed, { id: 'g2', amount: 5, status: 'PAID', reason: 'Delivery delay' },
    { id: 'g3', amount: 5, status: 'CANCELLED', reason: 'Mistake', cancellationReason: 'Not due' }],
  payouts: [{ id: 'p1', orderID: 'o1', returnID: null, goodwillRefundID: 'g2', amount: 5, currency: 'USD', method: 'CASH',
    payerName: 'Alice', actorName: 'Admin', actorID: 'a1', paidOn: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T10:00:00Z', reference: 'R1', note: null }] };
const order = { id: 'o1', currency: 'USD', returns: [{ id: 'r1', status: 'REFUNDED', refundAmount: 20 }] } as Order;
const oa = { run: vi.fn(async (_id, fn) => fn()), busyId: null } as unknown as OrderActionsApi;
function show(permissions = ['orders:view', 'refunds:manage'], locale: 'en' | 'ar' = 'en') {
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions }));
  return render(<RefundsSection order={order} locale={locale} oa={oa} />, { wrapper: Wrapper });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(refunds.summary).mockResolvedValue(summary);
  vi.mocked(refunds.create).mockResolvedValue({ refund: owed });
  vi.mocked(refunds.pay).mockResolvedValue({ refund: { ...owed, status: 'PAID' } });
  vi.mocked(refunds.cancel).mockResolvedValue({ refund: { ...owed, status: 'CANCELLED' } });
});
describe('Refunds section', () => {
  it.each(['orders:manage','returns:manage','payments:manage','refunds:view'])('hides controls for %s while preserving order read information', async permission => {
    show(['orders:view', permission]); await screen.findByText('Reason: Service issue');
    expect(screen.getByText(/No payout record/)).toBeInTheDocument();
    expect(screen.getByText(/Paid by: Alice/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create goodwill refund' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay cash refund' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel goodwill refund' })).not.toBeInTheDocument();
  });
  it('shows all statuses but offers payment and cancellation only for OWED', async () => {
    show(); await screen.findByText('Reason: Service issue');
    expect(screen.getAllByRole('button', { name: 'Pay cash refund' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Cancel goodwill refund' })).toHaveLength(1);
    expect(screen.getByText('Cancellation reason: Not due')).toBeInTheDocument();
  });
  it('creates owed, pays with cash evidence and cancels with a reason using the shared action runner', async () => {
    const user = userEvent.setup(); show();
    await user.click(await screen.findByRole('button', { name: 'Create goodwill refund' }));
    await user.type(screen.getByLabelText('Goodwill amount (USD)'), '12.50');
    await user.type(screen.getByLabelText('Reason'), 'Courtesy');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create goodwill refund' }));
    await waitFor(() => expect(refunds.create).toHaveBeenCalledWith('o1', { amountCents: 1250, reason: 'Courtesy', paidNow: false }));
    await user.click(screen.getByRole('button', { name: 'Pay cash refund' }));
    await user.type(screen.getByLabelText('Paid by'), 'Cashier');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pay cash refund' }));
    await waitFor(() => expect(refunds.pay).toHaveBeenCalledWith('o1', 'g1', { payerName: 'Cashier', paidOn: expect.any(String), reference: null, note: null }));
    await user.click(screen.getByRole('button', { name: 'Cancel goodwill refund' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel goodwill refund' })).toBeDisabled();
    await user.type(screen.getByLabelText('Cancellation reason'), 'Not due');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel goodwill refund' }));
    await waitFor(() => expect(refunds.cancel).toHaveBeenCalledWith('o1', 'g1', 'Not due'));
    expect(oa.run).toHaveBeenCalledTimes(3);
  });
  it('labels the section, statuses and controls in Arabic', async () => {
    show(undefined, 'ar');
    expect(await screen.findByRole('button', { name: 'إنشاء استرداد إضافي' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'الاستردادات' })).toBeInTheDocument();
    expect(screen.getByText(/استرداد مستحق/)).toBeInTheDocument();
    expect(screen.getByText(/لا يوجد سجل دفع/)).toBeInTheDocument();
  });
});
describe('Goodwill dialog', () => {
  it('paid now requires payer and a nonfuture date, sends exact cents and trimmed nullable details, and has no method selector', async () => {
    const user = userEvent.setup(); const onConfirm = vi.fn();
    render(<GoodwillDialog dialog={{ action: 'create' }} locale="en" currency="USD" remainingCents={2000} collectionCount={1} onClose={vi.fn()} onConfirm={onConfirm} />);
    const submit = screen.getByRole('button', { name: 'Create goodwill refund' });
    await user.type(screen.getByLabelText('Goodwill amount (USD)'), '20.01'); await user.type(screen.getByLabelText('Reason'), 'Courtesy');
    expect(submit).toBeDisabled(); fireEvent.change(screen.getByLabelText('Goodwill amount (USD)'), { target: { value: '20' } });
    await user.click(screen.getByLabelText('Paid now')); expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Paid by'), '  Cashier  ');
    fireEvent.change(screen.getByLabelText('Payout date'), { target: { value: '2999-01-01' } }); expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Payout date'), { target: { value: '2020-01-01' } });
    await user.type(screen.getByLabelText('Payout reference (optional)'), '   ');
    await user.click(submit);
    expect(onConfirm).toHaveBeenCalledWith({ action: 'create', body: { amountCents: 2000, reason: 'Courtesy', paidNow: true,
      payout: { payerName: 'Cashier', paidOn: '2020-01-01', reference: null, note: null } } });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it('blocks creation without collection evidence', () => {
    render(<GoodwillDialog dialog={{ action: 'create' }} locale="en" currency="USD" remainingCents={2000} collectionCount={0} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('Collection evidence is required.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create goodwill refund' })).toBeDisabled();
  });
});
