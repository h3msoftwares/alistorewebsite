import { describe, expect, it } from 'vitest';
import { indicatorsFromRecords } from '../../src/lib/order-return-indicators';

const ret = (status: string, quantity = 2, refundAmount = 30) => ({ status, items: [{ quantity, refundAmount }] });
const order = { subtotal: 110, discountAmount: 10, items: [{ quantity: 5, returnedQuantity: 5 }] };
const summarize = (...returns: ReturnType<typeof ret>[]) => indicatorsFromRecords({ ...order, returns });

describe('read-time return/refund indicators', () => {
  it('shows none without returns, regardless of the claimed returnedQuantity', () => {
    expect(summarize()).toMatchObject({ returnStatus: 'NONE', refundStatus: 'NONE', hasReturn: false, physicallyReturnedUnits: 0 });
  });
  it.each(['REQUESTED', 'APPROVED', 'IN_TRANSIT'])('shows %s as in progress, never physically received', (status) => {
    expect(summarize(ret(status))).toMatchObject({ returnStatus: 'IN_PROGRESS', refundStatus: 'NONE', inProgressUnits: 2, pendingRefundCents: 3000, physicallyReturnedUnits: 0 });
  });
  it('shows a partial receive awaiting marking', () => {
    expect(summarize(ret('RECEIVED'))).toMatchObject({ returnStatus: 'PARTIALLY_RETURNED', refundStatus: 'AWAITING_MARKING', physicallyReturnedUnits: 2, awaitingMarkingCents: 3000 });
  });
  it('shows a full receive awaiting marking', () => {
    expect(summarize(ret('RECEIVED', 5, 100))).toMatchObject({ returnStatus: 'FULLY_RETURNED', refundStatus: 'AWAITING_MARKING', physicallyReturnedUnits: 5 });
  });
  it('shows a partial marking against post-coupon merchandise value', () => {
    expect(summarize(ret('REFUNDED'))).toMatchObject({ refundStatus: 'PARTIALLY_MARKED', originalMerchandiseCents: 10000, markedRefundCents: 3000 });
  });
  it('shows a full marking', () => {
    expect(summarize(ret('REFUNDED', 5, 100))).toMatchObject({ returnStatus: 'FULLY_RETURNED', refundStatus: 'FULLY_MARKED', markedRefundCents: 10000 });
  });
  it('preserves completed, received and pending amounts across multiple returns', () => {
    expect(summarize(ret('REFUNDED', 1, 20), ret('RECEIVED', 1, 20), ret('REQUESTED', 2, 40)))
      .toMatchObject({ returnStatus: 'PARTIALLY_RETURNED', physicallyReturnedUnits: 2, inProgressUnits: 2,
        refundStatus: 'PARTIALLY_MARKED', markedRefundCents: 2000, awaitingMarkingCents: 2000, pendingRefundCents: 4000, activeReturns: 3 });
  });
  it('handles a whole-order received Return with several ReturnItems identically', () => {
    expect(summarize({ status: 'RECEIVED', items: [{ quantity: 2, refundAmount: 40 }, { quantity: 3, refundAmount: 60 }] }))
      .toMatchObject({ returnStatus: 'FULLY_RETURNED', awaitingMarkingCents: 10000, activeReturns: 1 });
  });
  it.each(['REJECTED', 'CANCELLED'])('excludes %s completely', (status) => {
    expect(summarize(ret(status, 5, 100))).toEqual(summarize());
  });
  it('keeps zero-dollar marking visible without pretending it covers a positive-value order', () => {
    expect(summarize(ret('REFUNDED', 1, 0))).toMatchObject({ refundStatus: 'PARTIALLY_MARKED', markedRefundCents: 0 });
    expect(summarize(ret('RECEIVED', 1, 0))).toMatchObject({ refundStatus: 'AWAITING_MARKING', awaitingMarkingCents: 0 });
  });
  it('requires all zero-value merchandise units to be received and marked for full marking', () => {
    const zero = (returns: ReturnType<typeof ret>[]) => indicatorsFromRecords({ ...order, subtotal: 10, returns });
    expect(zero([ret('REFUNDED', 1, 0)]).refundStatus).toBe('PARTIALLY_MARKED');
    expect(zero([ret('REFUNDED', 5, 0)]).refundStatus).toBe('FULLY_MARKED');
  });
});
