import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en' }) }));

vi.mock('@/lib/api', () => ({
  ordersApi: { adminDashboard: vi.fn() },
  analyticsApi: { getOverview: vi.fn() },
}));

import { ordersApi, analyticsApi } from '@/lib/api';
import AdminDashboardPage from './page';

const mock = vi.mocked(ordersApi, true);
const analyticsMock = vi.mocked(analyticsApi, true);

const overview = {
  range: { from: '2026-08-09T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' },
  kpis: {},
  revenueSeries: [
    { bucket: '2026-09-06T00:00:00.000Z', revenue: 120, orders: 3 },
    { bucket: '2026-09-07T00:00:00.000Z', revenue: 200, orders: 5 },
  ],
  funnel: { configured: false },
  note: '',
};

const dashboard = {
  totalOrders: 12,
  pendingOrders: 3,
  totalRevenue: 840,
  flaggedOrders: 1,
  awaitingCodCollection: 2,
  lowStockVariants: 4,
  outOfStockVariants: 1,
  recentOrders: [
    {
      id: 'o1',
      orderNumber: 'AS-20260906-ABC123',
      deliveryName: 'Jane Doe',
      total: 43,
      discountAmount: 7,
      couponCode: 'SAVE7',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      flaggedForReview: false,
      dateCreated: '2026-09-06T10:00:00.000Z',
    },
  ],
};

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(<AdminDashboardPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.adminDashboard.mockResolvedValue(dashboard as never);
  analyticsMock.getOverview.mockResolvedValue(overview as never);
});

describe('AdminDashboardPage', () => {
  it('shows the action tiles with their counts', async () => {
    renderPage();
    expect(await screen.findByText('Pending orders')).toBeInTheDocument();
    expect(screen.getByText('of 12 total')).toBeInTheDocument();
    expect(screen.getByText('Flagged for review')).toBeInTheDocument();
    expect(screen.getByText('Awaiting COD')).toBeInTheDocument();
    // low (4) + out of stock (1) shown as one tile
    expect(screen.getByText('Low / out of stock')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('1 out of stock')).toBeInTheDocument();
  });

  it('renders the 30-day revenue & orders trend chart', async () => {
    renderPage();
    expect(await screen.findByText('Revenue & orders')).toBeInTheDocument();
    expect(screen.getByText(/Last 30 days/)).toBeInTheDocument();
  });

  it('marks a recent order that used a coupon', async () => {
    renderPage();
    await screen.findByText('AS-20260906-ABC123');
    expect(screen.getByText(/−\$7\.00 · SAVE7/)).toBeInTheDocument();
  });

  it('lists the recent orders', async () => {
    renderPage();
    expect(await screen.findByText('AS-20260906-ABC123')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('$43.00')).toBeInTheDocument();
  });

  it('renders the quick-action shortcuts', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'New product' })).toHaveAttribute(
      'href',
      '/en/admin/products/new'
    );
    expect(screen.getByRole('link', { name: 'New collection' })).toHaveAttribute(
      'href',
      '/en/admin/collections/new'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/en/admin/settings');
  });

  it('shows an error state with a retry when the fetch fails', async () => {
    mock.adminDashboard.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText("Couldn't load the dashboard")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
