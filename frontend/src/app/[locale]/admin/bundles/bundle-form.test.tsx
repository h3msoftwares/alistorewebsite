import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeAuthedStore } from '@/test/utils';
import { BundleForm } from './bundle-form';

const { save, push } = vi.hoisted(() => ({ save: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/use-bundles', () => ({ useSaveBundle: () => ({ mutateAsync: save, isPending: false }) }));
const products = [{ id: 'p1', nameEn: 'Product A', nameAr: 'أ', sku: 'PA', isActive: true, price: 30, variants: [{ id: 'v1', sku: 'A', size: 'M' }] },
  { id: 'p2', nameEn: 'Product B', nameAr: 'ب', sku: 'PB', isActive: true, price: 40, variants: [{ id: 'v2', sku: 'B', color: 'Black' }] }];
vi.mock('@/hooks/use-catalog', () => ({ useProducts: () => ({ data: { items: products } }), useProduct: (id: string) => ({ data: products.find((p) => p.id === id) }) }));
function show(manage = true) {
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions: ['bundles:view', ...(manage ? ['bundles:manage'] : [])] }));
  return render(<BundleForm locale="en" />, { wrapper: Wrapper });
}
async function fill() {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Name (English)' }), 'Starter');
  await user.type(screen.getByRole('textbox', { name: 'Name (Arabic)' }), 'باقة');
  for (let i = 0; i < 2; i++) {
    await user.selectOptions(screen.getAllByRole('combobox', { name: 'Product' })[i], products[i].id);
    await user.selectOptions(screen.getAllByRole('combobox', { name: 'Exact variant / SKU' })[i], products[i].variants[0].id);
  }
  await user.clear(screen.getAllByRole('spinbutton', { name: 'Required quantity' })[0]);
  await user.type(screen.getAllByRole('spinbutton', { name: 'Required quantity' })[0], '2');
  await user.type(screen.getByRole('spinbutton', { name: 'Bundle price ($)' }), '80');
  return user;
}
beforeEach(() => { vi.clearAllMocks(); save.mockResolvedValue({ id: 'new' }); });
describe('Bundle recipe form', () => {
  it('picks exact variants, shows bounds/savings and submits one flat price', async () => {
    show(); const user = await fill();
    expect(screen.getByText(/Separate total.*\$100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Bundle savings.*\$20\.00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Bundle' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ nameEn: 'Starter', nameAr: 'باقة', price: 80, status: 'DRAFT', startsAt: null, endsAt: null, components: [{ variantID: 'v1', quantity: 2 }, { variantID: 'v2', quantity: 1 }] }));
    expect(push).toHaveBeenCalledWith('/en/admin/bundles');
  });
  it('shows server validation failures', async () => {
    save.mockRejectedValue(new Error('Bundle price must be above $70.00 and below $100.00.'));
    show(); const user = await fill(); await user.click(screen.getByRole('button', { name: 'Add Bundle' }));
    expect(await screen.findByText('Bundle price must be above $70.00 and below $100.00.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
  it('hides the entire write form without bundles:manage', () => {
    show(false);
    expect(screen.queryByRole('button', { name: 'Add Bundle' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name (English)')).not.toBeInTheDocument();
  });
});
