import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

// One consolidated end-to-end sweep of the three real user journeys — guest
// checkout, account checkout + cancel, and admin fulfilment — each driven
// entirely through the HTTP API, top to bottom. SMTP is the only mock.
vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return {
    ...actual,
    sendVerificationEmail: vi.fn().mockResolvedValue(true),
    sendCheckoutOtpEmail: vi.fn().mockResolvedValue(true),
    sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true),
    sendOwnerOrderAlertEmail: vi.fn().mockResolvedValue(true),
    sendOrderCancelledEmail: vi.fn().mockResolvedValue(true),
    sendOwnerOrderCancelledAlertEmail: vi.fn().mockResolvedValue(true),
    sendOrderShippedEmail: vi.fn().mockResolvedValue(true),
  };
});
import { sendVerificationEmail, sendCheckoutOtpEmail, sendOrderShippedEmail } from '../../src/lib/mailer';
const mockVerify = vi.mocked(sendVerificationEmail);
const mockOtp = vi.mocked(sendCheckoutOtpEmail);
const mockShipped = vi.mocked(sendOrderShippedEmail);

const app = buildApp();

const HCAPTCHA_DUMMY_TOKEN = '10000000-aaaa-bbbb-cccc-000000000001';

let variantId: string;
let productId: string;

beforeEach(async () => {
  vi.clearAllMocks();
  const col = await makeCollection({ slug: 'e2e' });
  const cat = await makeCategory({ slug: 'e2e-cat' });
  const p = await makeProduct(cat.id, {
    over: { price: 30, nameEn: 'E2E Tee' },
    variants: [{ sku: 'e2e-v1', size: 'M', color: 'Black', stockQuantity: 20 }],
  });
  productId = p.id;
  variantId = p.variants[0].id;
});

const delivery = {
  deliveryName: 'Jamie Rivers',
  deliveryPhone: '0791234567',
  deliveryAddress: '4 Cedar Lane',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

/** Full checkout-email-OTP dance → returns the redeemable verify token. */
async function getCheckoutVerifyToken(email: string): Promise<string> {
  mockOtp.mockClear();
  const req = await request(app)
    .post('/api/checkout/otp/request')
    .send({ email, captchaToken: HCAPTCHA_DUMMY_TOKEN });
  expect(req.status).toBe(204);
  const code = mockOtp.mock.calls.at(-1)?.[1] as string;
  const verify = await request(app).post('/api/checkout/otp/verify').send({ email, code });
  expect(verify.status).toBe(200);
  return verify.body.verifyToken as string;
}

describe('E2E — guest checkout journey', () => {
  it('browse → guest cart → email OTP → checkout → track order', async () => {
    const agent = request.agent(app); // persists the guest cartSession cookie

    // Browse.
    const list = await agent.get('/api/products?page=1&pageSize=24');
    expect(list.status).toBe(200);
    expect(list.body.items.some((p: { id: string }) => p.id === productId)).toBe(true);
    expect((await agent.get(`/api/products/${productId}`)).status).toBe(200);

    // Add to the guest cart.
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    expect(add.status).toBe(201);
    const cart = await agent.get('/api/cart');
    expect(cart.body.items).toHaveLength(1);
    expect(cart.body.subtotal).toBe(60);

    // Verify contact email, then place the COD order.
    const email = 'guest@e2e.test';
    const verifyToken = await getCheckoutVerifyToken(email);
    const placed = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, guestEmail: email, emailVerifyToken: verifyToken });
    expect(placed.status).toBe(201);
    const order = placed.body.order;
    expect(Number(order.total)).toBe(60);

    // Cart cleared, stock decremented.
    expect((await agent.get('/api/cart')).body.items).toHaveLength(0);
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(18);

    // Guest self-service tracking: lookup by order number + contact → token → view.
    const lookup = await request(app)
      .post('/api/orders/lookup')
      .send({ orderNumber: order.orderNumber, contact: email });
    expect(lookup.status).toBe(200);
    const tracked = await request(app).get(`/api/orders/track/${lookup.body.token}`);
    expect(tracked.status).toBe(200);
    expect(tracked.body.order.orderNumber).toBe(order.orderNumber);
  });
});

describe('E2E — account journey', () => {
  it('register → verify email → login → cart → checkout → cancel (stock restored)', async () => {
    const email = 'member@e2e.test';
    const password = 'Password123!';

    // Register (verification email captured from the mailer mock).
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email, password, name: 'Member', address: { phone: '0790000000', addressLine: '1 A St', city: 'Beirut' } });
    expect(reg.status).toBe(201);
    const verifyUrl = mockVerify.mock.calls.at(-1)?.[1] as string;
    const token = new URL(verifyUrl).searchParams.get('token');
    expect(token).toBeTruthy();
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);

    // Login.
    const login = await request(app).post('/api/auth/login').send({ identifier: email, password });
    expect(login.status).toBe(200);
    const accessToken: string = login.body.accessToken;
    expect(accessToken).toBeTruthy();

    // Cart + checkout (a verified account skips the checkout OTP).
    await request(app).post('/api/cart/items').set(bearer(accessToken)).send({ variantId, quantity: 3 });
    const placed = await request(app).post('/api/orders/checkout').set(bearer(accessToken)).send(delivery);
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id;
    expect(Number(placed.body.order.total)).toBe(90);

    // View then cancel their own order.
    expect((await request(app).get(`/api/orders/${orderId}`).set(bearer(accessToken))).status).toBe(200);
    const cancel = await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(accessToken));
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('CANCELLED');

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(20); // 20 - 3 at checkout, + 3 back on cancel
  });
});

describe('E2E — admin fulfilment journey', () => {
  it('admin login → list orders → ship (status + estimate) → mark COD collected → dashboard', async () => {
    // A standing order to work.
    const buyerAgent = request.agent(app);
    await buyerAgent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const verifyToken = await getCheckoutVerifyToken('buyer@e2e.test');
    const placed = await buyerAgent
      .post('/api/orders/checkout')
      .send({ ...delivery, guestEmail: 'buyer@e2e.test', emailVerifyToken: verifyToken });
    const orderId = placed.body.order.id;

    const { token: adminToken } = await createAdmin();

    const list = await request(app).get('/api/admin/orders').set(bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.orders.some((o: { id: string }) => o.id === orderId)).toBe(true);

    const shipped = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'SHIPPED', estimatedDeliveryDays: 4 });
    expect(shipped.status).toBe(200);
    expect(shipped.body.order.estimatedDeliveryDays).toBe(4);
    await new Promise((r) => setTimeout(r, 40)); // shipped email is fire-and-forget
    expect(mockShipped).toHaveBeenCalledTimes(1);

    await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'DELIVERED' });
    const collected = await request(app)
      .patch(`/api/admin/orders/${orderId}/collected`)
      .set(bearer(adminToken))
      .send({ collected: true });
    expect(collected.body.order.paymentStatus).toBe('COLLECTED');

    const dash = await request(app).get('/api/admin/dashboard').set(bearer(adminToken));
    expect(dash.body).toMatchObject({ totalOrders: 1, pendingOrders: 0 });
    expect(Number(dash.body.totalRevenue)).toBe(30); // one DELIVERED order, subtotal 30
    expect(dash.body.recentOrders[0].id).toBe(orderId);
  });
});
