import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefundMarkingDialog } from './refund-marking-dialog';

const defaults = { locale: 'en' as const, calculatedCents: 2000, remainingRefundableCents: 10000,
  remainingDeliveryRefundableCents: 1000, remainingTotalRefundableCents: 11000, collectionCount: 1,
  onClose: vi.fn(), onConfirm: vi.fn() };
function amount(value: string, label = 'Merchandise amount refunded (USD)') {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('refund marking choices', () => {
  it('requires cash evidence above zero, defaults the date, rejects future dates and trims optional references', async () => {
    const onConfirm = vi.fn(); const user = userEvent.setup(); render(<RefundMarkingDialog {...defaults} onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'Mark refunded' });
    expect(button).toBeDisabled(); expect((screen.getByLabelText('Payout date') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await user.type(screen.getByLabelText('Paid by'), '  Cashier  ');
    amount('2999-01-01', 'Payout date'); expect(button).toBeDisabled();
    amount('2020-01-01', 'Payout date'); await user.type(screen.getByLabelText('Payout reference (optional)'), '   ');
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ payout: { payerName: 'Cashier', paidOn: '2020-01-01', reference: null, note: null } }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it.each(['0', '10', '30'])('requires a reason when the admin chooses $%s, and sends exact cents', async value => {
    const onConfirm = vi.fn(); const user = userEvent.setup(); render(<RefundMarkingDialog {...defaults} onConfirm={onConfirm} />);
    amount(value);
    expect(screen.getByRole('button', { name: 'Mark refunded' })).toBeDisabled();
    await user.type(screen.getByLabelText('Adjustment reason'), 'Store decision');
    if (Number(value) > 0) await user.type(screen.getByLabelText('Paid by'), 'Cashier');
    await user.click(screen.getByRole('button', { name: 'Mark refunded' }));
    expect(onConfirm).toHaveBeenCalledWith({ merchandiseRefundCents: Number(value) * 100,
      refundAdjustmentReason: 'Store decision', deliveryRefundCents: 0, deliveryRefundReason: undefined,
      ...(Number(value) > 0 ? { payout: { payerName: 'Cashier', paidOn: expect.any(String), reference: null, note: null } } : {}) });
  });
  it('keeps delivery off by default and requires its own amount and reason when enabled', async () => {
    const onConfirm = vi.fn(); const user = userEvent.setup(); render(<RefundMarkingDialog {...defaults} onConfirm={onConfirm} />);
    expect(screen.getByLabelText('Also mark delivery refunded')).not.toBeChecked();
    expect(screen.queryByLabelText('Delivery refund reason')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Also mark delivery refunded'));
    expect(screen.getByRole('button', { name: 'Mark refunded' })).toBeDisabled();
    amount('10.01', 'Delivery amount refunded (USD)');
    expect(screen.getByText('Delivery amount exceeds remaining delivery refundable.')).toBeInTheDocument();
    amount('10', 'Delivery amount refunded (USD)');
    await user.type(screen.getByLabelText('Delivery refund reason'), 'Delivery issue');
    await user.type(screen.getByLabelText('Paid by'), 'Cashier');
    await user.click(screen.getByRole('button', { name: 'Mark refunded' }));
    expect(onConfirm).toHaveBeenCalledWith({ merchandiseRefundCents: 2000, refundAdjustmentReason: undefined,
      deliveryRefundCents: 1000, deliveryRefundReason: 'Delivery issue',
      payout: { payerName: 'Cashier', paidOn: expect.any(String), reference: null, note: null } });
  });
  it('shows the combined cap after reversal even when the delivery category cap permits more', async () => {
    const user = userEvent.setup(); render(<RefundMarkingDialog {...defaults} calculatedCents={0}
      remainingRefundableCents={0} remainingTotalRefundableCents={0} />);
    await user.click(screen.getByLabelText('Also mark delivery refunded'));
    amount('10', 'Delivery amount refunded (USD)');
    await user.type(screen.getByLabelText('Delivery refund reason'), 'Delivery issue');
    expect(screen.getByText('Total refunded would exceed net collected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark refunded' })).toBeDisabled();
  });
  it('allows adjusting to zero without collection evidence and keeps the existing block message for positive amounts', async () => {
    const user = userEvent.setup(); render(<RefundMarkingDialog {...defaults} collectionCount={0}
      remainingRefundableCents={0} remainingDeliveryRefundableCents={0} remainingTotalRefundableCents={0} />);
    expect(screen.getByText(/No COD collection recorded/)).toBeInTheDocument();
    amount('0'); await user.type(screen.getByLabelText('Adjustment reason'), 'Refund refused');
    expect(screen.getByRole('button', { name: 'Mark refunded' })).toBeEnabled();
  });
  it.each(['-1', '0.001', '20.001'])('rejects invalid dollar input %s instead of rounding', value => {
    render(<RefundMarkingDialog {...defaults} />); amount(value);
    expect(screen.getByRole('button', { name: 'Mark refunded' })).toBeDisabled();
  });
  it('shows the choices and cap explanations in Arabic', async () => {
    const user = userEvent.setup(); render(<RefundMarkingDialog {...defaults} locale="ar" />);
    expect(screen.getByLabelText('مبلغ البضائع المسترد (USD)')).toHaveValue(20);
    expect(screen.getByText(/لا يمكن أن يتجاوز إجمالي المبالغ/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('تعليم مبلغ التوصيل أيضاً كمسترد'));
    expect(screen.getByLabelText('سبب استرداد التوصيل')).toBeRequired();
  });
});
