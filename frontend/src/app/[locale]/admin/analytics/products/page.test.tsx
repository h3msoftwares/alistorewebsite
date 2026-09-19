import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en' }) }));

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
import { AnalyticsRangeProvider } from '../range-context';
import AnalyticsProductsPage from './page';

const mock = vi.mocked(analyticsApi, true);

beforeEach(() => vi.clearAllMocks());

function makeReport(count: number) {
  return {
    range: { from: '2026-01-01', to: '2026-01-31' },
    products: Array.from({ length: count }, (_, i) => ({
      name: `Product ${i + 1}`,
      sku: `SKU-${i + 1}`,
      productId: `p${i + 1}`,
      units: i + 1,
      revenue: (i + 1) * 10,
      orders: i + 1,
      buyers: i + 1,
      views: null,
      viewToPurchaseRate: null,
      viewToCartRate: null,
    })),
    ga: { configured: false as const },
    note: 'test note',
  };
}

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(
    <Wrapper>
      <AnalyticsRangeProvider>
        <AnalyticsProductsPage />
      </AnalyticsRangeProvider>
    </Wrapper>
  );
}

describe('AnalyticsProductsPage', () => {
  it('links each product row to its admin edit page', async () => {
    mock.getProducts.mockResolvedValue(makeReport(2) as never);
    renderPage();

    const link = await screen.findByRole('link', { name: 'Product 1' });
    expect(link).toHaveAttribute('href', '/en/admin/products/p1');
  });

  it('paginates a long product list instead of rendering it all at once', async () => {
    const user = userEvent.setup();
    mock.getProducts.mockResolvedValue(makeReport(30) as never);
    renderPage();

    await screen.findByText('Product 1');
    expect(screen.queryByText('Product 30')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Product 30')).toBeInTheDocument();
  });
});
