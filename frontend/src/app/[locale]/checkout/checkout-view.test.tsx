import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeGuestStore } from '@/test/utils';
import { CheckoutView } from './checkout-view';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    cartApi: { getCart: vi.fn() },
    ordersApi: { getDeliveryQuote: vi.fn(), checkout: vi.fn() },
    accountApi: { listAddresses: vi.fn().mockResolvedValue([]) },
  };
});

import { cartApi, ordersApi } from '@/lib/api';
const mockCart = vi.mocked(cartApi, true);
const mockOrders = vi.mocked(ordersApi, true);

const cart = {
  subtotal: 40,
  items: [
    {
      id: 'ci1',
      quantity: 2,
      variant: { price: null, product: { nameEn: 'Tee', nameAr: 'قميص', price: 20 } },
    },
  ],
};

function renderView() {
  const { Wrapper } = createWrapper(makeGuestStore());
  return render(<CheckoutView locale="en" />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCart.getCart.mockResolvedValue(cart as never);
  mockOrders.getDeliveryQuote.mockResolvedValue({
    subtotal: 40,
    deliveryFee: 3,
    total: 43,
    freeReason: null,
  } as never);
  mockOrders.checkout.mockResolvedValue({
    orderNumber: 'AS-001',
    total: 43,
    deliveryPhone: '0791111111',
    items: [],
  } as never);
});

describe('CheckoutView', () => {
  it('shows the empty state when the cart has no items', async () => {
    mockCart.getCart.mockResolvedValue({ subtotal: 0, items: [] } as never);
    renderView();
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
  });

  it('quotes the delivery fee once a governorate is chosen and rolls it into the total', async () => {
    const user = userEvent.setup();
    renderView();

    const governorate = await screen.findByRole('combobox', { name: /governorate/i });
    await user.selectOptions(governorate, 'MOUNT_LEBANON');
    await waitFor(() => expect(mockOrders.getDeliveryQuote).toHaveBeenCalledWith('MOUNT_LEBANON'));
    expect(await screen.findByText('$43.00')).toBeInTheDocument(); // total
    expect(screen.getByText('$3.00')).toBeInTheDocument(); // delivery line
  });

  it('submits the delivery snapshot incl. deliveryRegion and shows a confirmation', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole('textbox', { name: /full name/i });

    await user.type(screen.getByRole('textbox', { name: /full name/i }), 'Jane Doe');
    await user.type(screen.getByRole('textbox', { name: /phone/i }), '0791111111');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@test.dev');
    await user.type(screen.getByRole('textbox', { name: /street address/i }), '12 Rainbow Street');
    await user.type(screen.getByRole('textbox', { name: /^city/i }), 'Jounieh');
    await user.selectOptions(screen.getByRole('combobox', { name: /governorate/i }), 'MOUNT_LEBANON');
    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() => expect(mockOrders.checkout).toHaveBeenCalled());
    expect(mockOrders.checkout.mock.calls[0][0]).toMatchObject({
      deliveryRegion: 'MOUNT_LEBANON',
      deliveryCity: 'Jounieh',
      guestEmail: 'jane@test.dev',
    });
    expect(await screen.findByText('Order placed')).toBeInTheDocument();
  });
});
