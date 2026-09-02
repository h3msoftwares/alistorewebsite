import { describe, it, expect } from 'vitest';
import { generateOrderNumber } from '../../src/lib/orderNumber';

describe('generateOrderNumber', () => {
  it('produces an AS-YYYYMMDD-#### style order number', () => {
    const num = generateOrderNumber();
    expect(num).toMatch(/^AS-\d{8}-\d{4}$/);
  });
});
