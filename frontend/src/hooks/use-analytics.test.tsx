import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';

vi.mock('@/lib/api', () => ({
  analyticsApi: {
    getOverview: vi.fn(),
    getSales: vi.fn(),
    getCustomers: vi.fn(),
    getInventory: vi.fn(),
    getProducts: vi.fn(),
    getVisitors: vi.fn(),
  },
}));

import { analyticsApi } from '@/lib/api';
import {
  useAnalyticsOverview,
  useAnalyticsSales,
  useAnalyticsVisitors,
} from './use-analytics';

const mock = vi.mocked(analyticsApi, true);

beforeEach(() => vi.clearAllMocks());

describe('use-analytics hooks', () => {
  it('useAnalyticsOverview fetches the overview report with resolved range params', async () => {
    mock.getOverview.mockResolvedValue({ kpis: { revenue: 42 } } as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAnalyticsOverview('30d'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ kpis: { revenue: 42 } }));
    const params = mock.getOverview.mock.calls[0][0];
    expect(params).toMatchObject({ granularity: 'day' });
    expect(typeof params.from).toBe('string');
    expect(typeof params.to).toBe('string');
  });

  it('preset drives granularity (90d -> week)', async () => {
    mock.getSales.mockResolvedValue({} as never);
    const { Wrapper } = createWrapper();
    renderHook(() => useAnalyticsSales('90d'), { wrapper: Wrapper });
    await waitFor(() => expect(mock.getSales).toHaveBeenCalled());
    expect(mock.getSales.mock.calls[0][0]).toMatchObject({ granularity: 'week' });
  });

  it('useAnalyticsVisitors surfaces the { configured: false } payload', async () => {
    mock.getVisitors.mockResolvedValue({ configured: false } as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAnalyticsVisitors('7d'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ configured: false }));
  });
});
