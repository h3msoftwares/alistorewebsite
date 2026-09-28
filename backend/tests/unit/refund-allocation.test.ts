import { describe, it, expect } from 'vitest';
import { allocateRefundCents } from '../../src/lib/refund-allocation';

describe('immutable effective cent allocation', () => {
  const lines = [
    { id: 'c', calculatedCents: 1, quantity: 1 },
    { id: 'a', calculatedCents: 1, quantity: 1 },
    { id: 'b', calculatedCents: 1, quantity: 1 },
  ];
  it('resolves tied remainders by line ID, independent of query order', () => {
    const sorted = (input: typeof lines) => allocateRefundCents(2, input).sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted(lines)).toEqual([{ id: 'a', cents: 1 }, { id: 'b', cents: 1 }, { id: 'c', cents: 0 }]);
    expect(sorted([...lines].reverse())).toEqual(sorted(lines));
  });
  it.each([0, 1, 1001, 999999999999])('adds up to exactly %i cents, including at the money limit', amount => {
    const allocations = allocateRefundCents(amount, [
      { id: 'a', calculatedCents: 333333333333, quantity: 1 },
      { id: 'b', calculatedCents: 666666666666, quantity: 2 },
      { id: 'c', calculatedCents: 0, quantity: 3 },
    ]);
    expect(allocations.reduce((sum, part) => sum + part.cents, 0)).toBe(amount);
    expect(allocations[2].cents).toBe(0);
  });
  it('uses quantities only when every calculated amount is zero', () => {
    expect(allocateRefundCents(100, [{ id: 'a', calculatedCents: 0, quantity: 1 }, { id: 'b', calculatedCents: 0, quantity: 2 }]))
      .toEqual([{ id: 'a', cents: 33 }, { id: 'b', cents: 67 }]);
  });
});
