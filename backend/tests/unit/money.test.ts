import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { round2, toNumber } from '../../src/lib/money';

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(10 / 3)).toBe(3.33);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.999)).toBe(20);
    expect(round2(5)).toBe(5);
    expect(round2(2.5)).toBe(2.5);
  });
});

describe('toNumber', () => {
  it('passes through a plain number', () => {
    expect(toNumber(42)).toBe(42);
  });
  it('converts a Prisma Decimal', () => {
    expect(toNumber(new Decimal('12.34'))).toBe(12.34);
  });
});
