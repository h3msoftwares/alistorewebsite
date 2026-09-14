import { describe, it, expect } from 'vitest';
import { DELIVERY_REGIONS, REGION_VALUES, isDeliveryRegion } from '../../src/lib/regions';

describe('regions', () => {
  it('REGION_VALUES mirrors DELIVERY_REGIONS 1:1', () => {
    expect(REGION_VALUES).toHaveLength(DELIVERY_REGIONS.length);
    expect(REGION_VALUES).toEqual(DELIVERY_REGIONS.map((r) => r.value));
  });

  it('isDeliveryRegion accepts every known region value', () => {
    for (const region of REGION_VALUES) {
      expect(isDeliveryRegion(region)).toBe(true);
    }
  });

  it('isDeliveryRegion rejects an unknown string', () => {
    expect(isDeliveryRegion('ATLANTIS')).toBe(false);
  });

  it('isDeliveryRegion is case-sensitive (values are uppercase)', () => {
    expect(isDeliveryRegion('beirut')).toBe(false);
    expect(isDeliveryRegion('Beirut')).toBe(false);
  });

  it('isDeliveryRegion rejects non-string input', () => {
    expect(isDeliveryRegion(null)).toBe(false);
    expect(isDeliveryRegion(undefined)).toBe(false);
    expect(isDeliveryRegion(42)).toBe(false);
    expect(isDeliveryRegion({})).toBe(false);
  });
});
