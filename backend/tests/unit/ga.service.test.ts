import { describe, it, expect, vi, beforeEach } from 'vitest';

// GA4 env vars default to '' in the test env — override so `ga4Configured()`
// is true for this file (same pattern as push.test.ts's VAPID override).
vi.mock('../../src/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/env')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      GA4_PROPERTY_ID: 'test-property',
      GA4_SA_CLIENT_EMAIL: 'test@test.dev',
      GA4_SA_PRIVATE_KEY: 'test-key',
    },
  };
});

// The one real I/O boundary — GA4's Data API client — mocked so the suite
// stays offline/deterministic.
const mockRunReport = vi.fn();
vi.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: class {
    runReport = mockRunReport;
  },
}));

import { ga4Configured, funnel } from '../../src/modules/analytics/ga.service';

describe('ga4Configured', () => {
  it('is true once all three service-account env vars are set', () => {
    expect(ga4Configured()).toBe(true);
  });
});

describe('funnel', () => {
  beforeEach(() => {
    mockRunReport.mockReset();
  });

  it('maps GA4 rows into funnel steps with conversion rates', async () => {
    mockRunReport.mockResolvedValue([
      {
        rows: [
          { dimensionValues: [{ value: 'view_item' }], metricValues: [{ value: '100' }] },
          { dimensionValues: [{ value: 'add_to_cart' }], metricValues: [{ value: '40' }] },
          { dimensionValues: [{ value: 'begin_checkout' }], metricValues: [{ value: '20' }] },
          { dimensionValues: [{ value: 'purchase' }], metricValues: [{ value: '10' }] },
        ],
      },
    ]);

    const result = await funnel({ from: new Date('2026-01-01'), to: new Date('2026-01-31') });
    expect(result.configured).toBe(true);
    if (!result.configured) throw new Error('expected configured');
    expect(result.steps.map((s) => s.count)).toEqual([100, 40, 20, 10]);
    expect(result.steps[1].conversionFromPrevious).toBeCloseTo(0.4);
    expect(result.steps[3].conversionFromTop).toBeCloseTo(0.1);
  });

  it('caches the result for 60s — a second call for the same range does not hit the client again', async () => {
    mockRunReport.mockResolvedValue([{ rows: [] }]);
    const range = { from: new Date('2026-03-01'), to: new Date('2026-03-31') };
    await funnel(range);
    await funnel(range);
    expect(mockRunReport).toHaveBeenCalledTimes(1);
  });
});
