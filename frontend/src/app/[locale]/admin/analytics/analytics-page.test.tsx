import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// Recharts' ResponsiveContainer needs a real layout box; stub it in jsdom.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> };
});

import { analyticsApi } from '@/lib/api';
import { AnalyticsRangeProvider } from './range-context';
import AnalyticsOverviewPage from './page';

const mock = vi.mocked(analyticsApi, true);

beforeEach(() => vi.clearAllMocks());

const overview = {
  range: { from: '2026-01-01', to: '2026-01-31' },
  kpis: {
    revenue: 1234,
    deliveredRevenue: 1000,
    orders: 20,
    averageOrderValue: 61.7,
    itemsPerOrder: 2.5,
    unitsSold: 50,
    newCustomers: 8,
    returningCustomers: 3,
    lowStockVariants: 4,
  },
  revenueSeries: [{ bucket: '2026-01-01T00:00:00.000Z', revenue: 100, orders: 2 }],
  funnel: { configured: false as const },
  note: 'test note',
};

describe('Analytics Overview page', () => {
  it('renders KPI tiles from the report and the connect-GA4 notice for the funnel', async () => {
    mock.getOverview.mockResolvedValue(overview as never);
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AnalyticsRangeProvider>
          <AnalyticsOverviewPage />
        </AnalyticsRangeProvider>
      </Wrapper>
    );

    expect(await screen.findByText('$1,234')).toBeInTheDocument(); // revenue
    expect(screen.getByText('Units sold')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText(/needs Google Analytics 4/i)).toBeInTheDocument();
  });
});
