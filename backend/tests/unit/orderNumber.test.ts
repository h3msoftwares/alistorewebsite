import { describe, it, expect } from 'vitest';
import { generateOrderNumber, generateUniqueOrderNumber } from '../../src/lib/orderNumber';

describe('generateOrderNumber', () => {
  it('produces an AS-YYYYMMDD-XXXXXX style order number (unambiguous alphabet)', () => {
    expect(generateOrderNumber()).toMatch(/^AS-\d{8}-[A-HJ-NP-Z2-9]{6}$/);
  });

  it('is practically collision-free across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateOrderNumber());
    expect(seen.size).toBe(5000);
  });
});

describe('generateUniqueOrderNumber', () => {
  it('returns the first candidate the DB does not already have', async () => {
    const db = { order: { findUnique: async () => null } } as never;
    expect(await generateUniqueOrderNumber(db)).toMatch(/^AS-\d{8}-[A-HJ-NP-Z2-9]{6}$/);
  });

  it('falls back to a timestamp-suffixed value when every candidate collides', async () => {
    const db = { order: { findUnique: async () => ({ id: 'x' }) } } as never;
    const n = await generateUniqueOrderNumber(db, 3);
    expect(n).toMatch(/^AS-\d{8}-[A-HJ-NP-Z2-9]{6}-[0-9A-Z]+$/);
  });
});
