import { describe, it, expect } from 'vitest';
import { remainingRefundableCents, refundBlockReason } from '../../src/modules/payments/collection.service';
import { markCollectedSchema } from '../../src/modules/payments/collection.schema';

describe('remaining refundable merchandise cents', () => {
  it.each([
    [0, 1000, 0, 0], [500, 1000, 0, 0], [11000, 1000, 0, 10000],
    [11000, 1000, 3000, 7000], [8000, 1000, 7000, 0], [100, 0, 101, 0],
    [501, 100, 200, 201],
  ])('collected %i - delivery %i - marked %i = %i', (collected, delivery, marked, expected) => {
    expect(remainingRefundableCents(collected, delivery, marked)).toBe(expected);
  });
  it('distinguishes missing evidence from a depleted cap, and permits zero marking', () => {
    expect(refundBlockReason(1, { collectionCount: 0, remainingRefundableCents: 0 })).toBe('NO_COLLECTION_RECORDED');
    expect(refundBlockReason(1, { collectionCount: 2, remainingRefundableCents: 0 })).toBe('EXCEEDS_REMAINING_REFUNDABLE');
    expect(refundBlockReason(0, { collectionCount: 0, remainingRefundableCents: 0 })).toBeNull();
    expect(refundBlockReason(100, { collectionCount: 1, remainingRefundableCents: 100 })).toBeNull();
  });
  it('requires amount, currency, date, collector and a nonblank reversal reason', () => {
    expect(markCollectedSchema.safeParse({ collected: true }).success).toBe(false);
    expect(markCollectedSchema.safeParse({ collected: false, collectionID: crypto.randomUUID(), reason: ' ' }).success).toBe(false);
    const body = { collected: true, amount: 12.25, currency: 'USD', collectedAt: '2026-09-28T12:00:00Z', collectorName: 'Courier', reference: 'Receipt' };
    expect(markCollectedSchema.safeParse(body).success).toBe(true);
    expect(markCollectedSchema.safeParse({ ...body, amount: 12.255 }).success).toBe(false);
    expect(markCollectedSchema.safeParse({ ...body, collectorName: undefined }).success).toBe(false);
    expect(markCollectedSchema.safeParse({ ...body, collectorName: '  ' }).success).toBe(false);
    expect(markCollectedSchema.safeParse({ ...body, reference: 'x'.repeat(501) }).success).toBe(false);
  });
  it.each([undefined, null, '', '   '])('normalizes absent or blank reference %j to null', (reference) => {
    const parsed = markCollectedSchema.parse({ collected: true, amount: 12.25, currency: 'USD',
      collectedAt: '2026-09-28T12:00:00Z', collectorName: 'Courier', reference });
    expect(parsed).toMatchObject({ reference: null, collectorName: 'Courier' });
  });
  it('trims a supplied reference', () => {
    expect(markCollectedSchema.parse({ collected: true, amount: 12.25, currency: 'USD',
      collectedAt: '2026-09-28T12:00:00Z', collectorName: 'Courier', reference: '  Receipt 1  ' })).toMatchObject({ reference: 'Receipt 1' });
  });
});
