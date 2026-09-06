import { describe, it, expect } from 'vitest';
import { resolveDeliveryFee, type DeliveryConfig } from '../../src/lib/delivery-fee';

const base: DeliveryConfig = {
  deliveryFeeEnabled: true,
  deliveryFeeFlat: 3,
  freeDeliveryThreshold: null,
  freeDeliveryRegions: [],
  deliveryRates: [{ region: 'BEIRUT', fee: 2 }],
};

describe('resolveDeliveryFee', () => {
  it('is free with reason "disabled" when the master switch is off', () => {
    expect(resolveDeliveryFee({ ...base, deliveryFeeEnabled: false }, 10, 'NORTH')).toEqual({
      fee: 0,
      freeReason: 'disabled',
    });
  });

  it('is free with reason "threshold" once the subtotal reaches the threshold', () => {
    const cfg = { ...base, freeDeliveryThreshold: 50 };
    expect(resolveDeliveryFee(cfg, 50, 'NORTH')).toEqual({ fee: 0, freeReason: 'threshold' });
    expect(resolveDeliveryFee(cfg, 49.99, 'NORTH').fee).toBe(3);
  });

  it('is free with reason "region" for a governorate on the free list', () => {
    expect(resolveDeliveryFee({ ...base, freeDeliveryRegions: ['SOUTH'] }, 10, 'SOUTH')).toEqual({
      fee: 0,
      freeReason: 'region',
    });
  });

  it('uses a per-governorate override when one exists', () => {
    expect(resolveDeliveryFee(base, 10, 'BEIRUT')).toEqual({ fee: 2, freeReason: null });
  });

  it('falls back to the flat fee for a governorate with no override', () => {
    expect(resolveDeliveryFee(base, 10, 'BEQAA')).toEqual({ fee: 3, freeReason: null });
  });

  it('rounds the fee to cents', () => {
    const cfg = { ...base, deliveryRates: [{ region: 'AKKAR', fee: 2.005 }] };
    expect(resolveDeliveryFee(cfg, 10, 'AKKAR').fee).toBe(2.01);
  });

  it('threshold beats a per-region override', () => {
    const cfg = { ...base, freeDeliveryThreshold: 20 };
    expect(resolveDeliveryFee(cfg, 25, 'BEIRUT')).toEqual({ fee: 0, freeReason: 'threshold' });
  });
});
