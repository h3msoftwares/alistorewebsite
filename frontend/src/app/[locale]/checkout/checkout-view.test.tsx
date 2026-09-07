import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeGuestStore, makeAuthedStore } from '@/test/utils';
import { CheckoutView } from './checkout-view';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

// The real widget loads hCaptcha's external script — swap it for a button
// that reports a fixed token, same idea as mocking any other third-party
// widget out of a component test.
vi.mock('@/components/checkout/hcaptcha-widget', () => ({
  HCaptchaWidget: forwardRef(function MockHCaptchaWidget(
    { onVerify }: { onVerify: (token: string) => void },
    _ref: unknown
  ) {
    return (
      <button type="button" onClick={() => onVerify('test-captcha-token')}>
        Solve captcha
      </button>
    );
  }),
}));

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    cartApi: { getCart: vi.fn() },
    ordersApi: { getDeliveryQuote: vi.fn(), checkout: vi.fn() },
    accountApi: { listAddresses: vi.fn(), getProfile: vi.fn() },
    checkoutOtpApi: { requestOtp: vi.fn(), verifyOtp: vi.fn() },
  };
});

import { cartApi, ordersApi, accountApi, checkoutOtpApi } from '@/lib/api';
const mockCart = vi.mocked(cartApi, true);
const mockOrders = vi.mocked(ordersApi, true);
const mockAccount = vi.mocked(accountApi, true);
const mockCheckoutOtp = vi.mocked(checkoutOtpApi, true);

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

const savedAddress = {
  id: 'a1',
  userID: 'u1',
  fullName: 'Ali Customer',
  phone: '0790000000',
  addressLine: '12 Rainbow St',
  city: 'Jounieh',
  region: 'MOUNT_LEBANON',
  area: 'Haret Sakher',
  notes: null,
  isDefault: true,
};

function renderGuest() {
  const { Wrapper } = createWrapper(makeGuestStore());
  return render(<CheckoutView locale="en" />, { wrapper: Wrapper });
}
function renderAuthed() {
  const { Wrapper } = createWrapper(makeAuthedStore());
  return render(<CheckoutView locale="en" />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCart.getCart.mockResolvedValue(cart as never);
  mockAccount.listAddresses.mockResolvedValue([] as never);
  mockAccount.getProfile.mockResolvedValue({
    id: 'u1',
    name: 'Ali Customer',
    email: 'ali@test.dev',
    role: 'CUSTOMER',
    isActive: true,
    dateCreated: 'x',
    // Verified by default — these existing tests are about the address
    // flow, not OTP, so a verified logged-in shopper skips that step
    // entirely (see the dedicated email-OTP tests below).
    emailVerified: '2026-01-01T00:00:00.000Z',
  } as never);
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
  mockCheckoutOtp.requestOtp.mockResolvedValue(undefined as never);
  mockCheckoutOtp.verifyOtp.mockResolvedValue('verify-token-123' as never);
});

describe('CheckoutView', () => {
  it('shows the empty state when the cart has no items', async () => {
    mockCart.getCart.mockResolvedValue({ subtotal: 0, items: [] } as never);
    renderGuest();
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
  });

  it('quotes the delivery fee once a governorate is chosen and rolls it into the total', async () => {
    const user = userEvent.setup();
    renderGuest();

    const governorate = await screen.findByRole('combobox', { name: /governorate/i });
    await user.selectOptions(governorate, 'MOUNT_LEBANON');
    await waitFor(() => expect(mockOrders.getDeliveryQuote).toHaveBeenCalledWith('MOUNT_LEBANON'));
    expect(await screen.findByText('$43.00')).toBeInTheDocument(); // total
    expect(screen.getByText('$3.00')).toBeInTheDocument(); // delivery line
  });

  it('guest: submits the delivery snapshot incl. name + email + deliveryRegion, after email-OTP verification', async () => {
    const user = userEvent.setup();
    renderGuest();
    await screen.findByRole('textbox', { name: /full name/i });

    await user.type(screen.getByRole('textbox', { name: /full name/i }), 'Jane Doe');
    await user.type(screen.getByRole('textbox', { name: /phone/i }), '0791111111');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@test.dev');
    await user.type(screen.getByRole('textbox', { name: /street address/i }), '12 Rainbow Street');
    await user.type(screen.getByRole('textbox', { name: /^city/i }), 'Jounieh');
    await user.selectOptions(screen.getByRole('combobox', { name: /governorate/i }), 'MOUNT_LEBANON');

    // "Place order" is disabled for a guest until the email is OTP-verified.
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Solve captcha' }));
    await user.click(screen.getByRole('button', { name: /send verification code/i }));
    await waitFor(() =>
      expect(mockCheckoutOtp.requestOtp).toHaveBeenCalledWith('jane@test.dev', 'test-captcha-token')
    );

    await user.type(await screen.findByRole('textbox', { name: /verification code/i }), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(mockCheckoutOtp.verifyOtp).toHaveBeenCalledWith('jane@test.dev', '123456'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() => expect(mockOrders.checkout).toHaveBeenCalled());
    expect(mockOrders.checkout.mock.calls[0][0]).toMatchObject({
      deliveryName: 'Jane Doe',
      deliveryRegion: 'MOUNT_LEBANON',
      deliveryCity: 'Jounieh',
      guestEmail: 'jane@test.dev',
      emailVerifyToken: 'verify-token-123',
    });
    expect(mockOrders.checkout.mock.calls[0][0]).not.toHaveProperty('saveAddress');
    expect(await screen.findByText('Order placed')).toBeInTheDocument();
  });

  it('signed-in but unverified: OTP step gates checkout, using the account email', async () => {
    mockAccount.listAddresses.mockResolvedValue([savedAddress] as never);
    mockAccount.getProfile.mockResolvedValue({
      id: 'u1',
      name: 'Ali Customer',
      email: 'ali@test.dev',
      role: 'CUSTOMER',
      isActive: true,
      dateCreated: 'x',
      emailVerified: null,
    } as never);
    const user = userEvent.setup();
    renderAuthed();

    await screen.findByText(/12 Rainbow St, Jounieh, Haret Sakher/);
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Solve captcha' }));
    await user.click(screen.getByRole('button', { name: /send verification code/i }));
    await waitFor(() =>
      expect(mockCheckoutOtp.requestOtp).toHaveBeenCalledWith('ali@test.dev', 'test-captcha-token')
    );
    await user.type(await screen.findByRole('textbox', { name: /verification code/i }), '654321');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Place order' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() => expect(mockOrders.checkout).toHaveBeenCalled());
    expect(mockOrders.checkout.mock.calls[0][0]).toMatchObject({
      addressId: 'a1',
      emailVerifyToken: 'verify-token-123',
    });
  });

  it('signed-in with a saved address: no form — picks it, name/email come from the profile', async () => {
    mockAccount.listAddresses.mockResolvedValue([savedAddress] as never);
    const user = userEvent.setup();
    renderAuthed();

    await screen.findByText(/12 Rainbow St, Jounieh, Haret Sakher/);
    expect(screen.queryByRole('textbox', { name: /full name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument();

    // Verified logged-in shopper (see the default profile mock's
    // emailVerified) ⇒ the whole OTP step is never rendered, not merely
    // completed off-screen.
    expect(screen.queryByRole('button', { name: /send verification code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solve captcha' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() => expect(mockOrders.checkout).toHaveBeenCalled());
    expect(mockOrders.checkout.mock.calls[0][0]).toMatchObject({
      addressId: 'a1',
      deliveryName: 'Ali Customer', // from profile
      guestEmail: 'ali@test.dev', // from profile
      deliveryPhone: '0790000000', // from address
      deliveryAddress: '12 Rainbow St',
      deliveryCity: 'Jounieh',
      deliveryRegion: 'MOUNT_LEBANON',
      deliveryArea: 'Haret Sakher',
    });

    // The genuinely-skipped assertion: not just that checkout succeeded, but
    // that neither OTP endpoint was ever hit, and the token sent to checkout
    // is actually undefined — not an empty string or some other default
    // that would silently satisfy a buggy "required" check server-side.
    expect(mockCheckoutOtp.requestOtp).not.toHaveBeenCalled();
    expect(mockCheckoutOtp.verifyOtp).not.toHaveBeenCalled();
    expect(mockOrders.checkout.mock.calls[0][0].emailVerifyToken).toBeUndefined();
  });

  it('signed-in without a saved address: fills the address form and it is saved for later', async () => {
    mockAccount.listAddresses.mockResolvedValue([] as never);
    const user = userEvent.setup();
    renderAuthed();

    await screen.findByRole('textbox', { name: /street address/i });
    expect(screen.queryByRole('textbox', { name: /full name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /phone/i }), '0795555555');
    await user.type(screen.getByRole('textbox', { name: /street address/i }), '5 Cedar Ave');
    await user.type(screen.getByRole('textbox', { name: /^city/i }), 'Zahle');
    await user.selectOptions(screen.getByRole('combobox', { name: /governorate/i }), 'BEQAA');
    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() => expect(mockOrders.checkout).toHaveBeenCalled());
    expect(mockOrders.checkout.mock.calls[0][0]).toMatchObject({
      saveAddress: true,
      deliveryName: 'Ali Customer', // profile
      guestEmail: 'ali@test.dev', // profile
      deliveryPhone: '0795555555',
      deliveryAddress: '5 Cedar Ave',
      deliveryCity: 'Zahle',
      deliveryRegion: 'BEQAA',
    });
  });

  it('signed-in: "Add a new address" switches from the picker to the form and back', async () => {
    mockAccount.listAddresses.mockResolvedValue([savedAddress] as never);
    const user = userEvent.setup();
    renderAuthed();

    await user.click(await screen.findByRole('button', { name: /add a new address/i }));
    expect(await screen.findByRole('textbox', { name: /street address/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use a saved address/i }));
    await screen.findByText(/12 Rainbow St, Jounieh/);
  });
});
