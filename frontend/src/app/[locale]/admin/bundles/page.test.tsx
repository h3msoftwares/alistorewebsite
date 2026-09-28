import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper, makeAuthedStore } from '@/test/utils';
import { bundlesApi } from '@/lib/api';
import BundlesPage from './page';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en' }) }));
vi.mock('@/lib/api', () => ({ bundlesApi: { listBundles: vi.fn(), deleteBundle: vi.fn() } }));
const fixture = { id: 'bundle1', nameEn: 'Starter Bundle', nameAr: 'باقة البداية', price: '80', status: 'ACTIVE', components: [
  { variantID: 'a', quantity: 2, variant: { sku: 'A', product: { nameEn: 'A', nameAr: 'أ' } } },
  { variantID: 'b', quantity: 1, variant: { sku: 'B', product: { nameEn: 'B', nameAr: 'ب' } } },
] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(bundlesApi.listBundles).mockResolvedValue([fixture] as never); });
describe('Bundle admin list', () => {
  it.each([false, true])('shows recipe/price to viewers and hides writes without manage (%s)', async (manage) => {
    const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions: ['bundles:view', ...(manage ? ['bundles:manage'] : [])] }));
    render(<BundlesPage />, { wrapper: Wrapper });
    await screen.findByText('Starter Bundle');
    expect(screen.getByText('2 × A (A) + 1 × B (B)')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(Boolean(screen.queryByRole('link', { name: 'New Bundle' }))).toBe(manage);
    expect(Boolean(screen.queryByRole('link', { name: 'Edit' }))).toBe(manage);
    expect(Boolean(screen.queryByRole('button', { name: 'Delete' }))).toBe(manage);
  });
});
