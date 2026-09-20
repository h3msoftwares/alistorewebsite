import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return {
    ...actual,
    sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true),
    sendCheckoutOtpEmail: vi.fn().mockResolvedValue(true),
  };
});
import { sendOrderConfirmationEmail, sendCheckoutOtpEmail } from '../../src/lib/mailer';
const mockConfirmEmail = vi.mocked(sendOrderConfirmationEmail);
const mockSendOtp = vi.mocked(sendCheckoutOtpEmail);

const app = buildApp(); // rate limiters off by default under test

// hCaptcha's own documented test secret (the app's default under test) only
// accepts this exact dummy passcode as "success: true" — a real network call
// to hCaptcha's public siteverify API, same convention as checkout-otp.test.ts.
const HCAPTCHA_DUMMY_TOKEN = '10000000-aaaa-bbbb-cccc-000000000001';

let variantId: string;

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

beforeEach(async () => {
  mockConfirmEmail.mockClear();
  mockSendOtp.mockClear();
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory();
  const p = await makeProduct(cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });
  variantId = p.variants[0].id;
});

function tokenFromUrl(url: string): string {
  return url.split('/').pop()!;
}

/** Requests + verifies a checkout email-OTP for `email` on `agent` (so the
 *  resulting ticket is scoped to the same guest cart session) and returns
 *  the verify token. */
async function getEmailVerifyToken(agent: ReturnType<typeof request.agent>, email: string): Promise<string> {
  mockSendOtp.mockClear();
  const reqRes = await agent.post('/api/checkout/otp/request').send({ email, captchaToken: HCAPTCHA_DUMMY_TOKEN });
  expect(reqRes.status).toBe(204);
  const code = mockSendOtp.mock.calls.at(-1)?.[1] as string;
  const verifyRes = await agent.post('/api/checkout/otp/verify').send({ email, code });
  expect(verifyRes.status).toBe(200);
  return verifyRes.body.verifyToken as string;
}

// The confirmation email fires void-and-catch after the status-change
// response — see order.service.ts's updateOrderStatus() CONFIRMED branch.
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 50));
}

/** Places a real order as a guest, then has an admin confirm it — only
 *  guest orders mint an OrderAccessToken, and only once confirmed (see
 *  order.service.ts's updateOrderStatus()) — and returns it plus the raw
 *  tracking token, captured from the mocked confirmation email's `orderUrl`
 *  argument, the same value a guest would get by clicking the link in
 *  their real inbox. */
async function placeOrder(email: string, phone = delivery.deliveryPhone) {
  const agent = request.agent(app);
  await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
  const emailVerifyToken = await getEmailVerifyToken(agent, email);

  const res = await agent
    .post('/api/orders/checkout')
    .send({ ...delivery, deliveryPhone: phone, guestEmail: email, emailVerifyToken });
  expect(res.status).toBe(201);
  const orderId = res.body.order.id as string;

  mockConfirmEmail.mockClear();
  const { token: adminToken } = await createAdmin();
  const confirmed = await request(app)
    .patch(`/api/admin/orders/${orderId}/status`)
    .set(bearer(adminToken))
    .send({ status: 'CONFIRMED' });
  expect(confirmed.status).toBe(200);
  await flushAsync();

  const call = mockConfirmEmail.mock.calls.at(-1)!;
  const trackingToken = tokenFromUrl(call[2] as string);
  return { orderId, orderNumber: res.body.order.orderNumber as string, trackingToken };
}

describe('OrderAccessToken is minted for guest orders only', () => {
  it('a guest checkout mints exactly one token and the confirmation email links to /orders/track/:token', async () => {
    const { orderId } = await placeOrder('scoped-guest@test.dev');

    expect(await prisma.orderAccessToken.count({ where: { orderID: orderId } })).toBe(1);
    const call = mockConfirmEmail.mock.calls.at(-1)!;
    expect(call[2] as string).toContain('/orders/track/');
  });

  it('a logged-in checkout mints no token — the confirmation email links directly to /orders/[id]', async () => {
    const { token: authToken } = await createCustomer(); // emailVerified defaults true — skips OTP
    await request(app).post('/api/cart/items').set(bearer(authToken)).send({ variantId, quantity: 1 });

    const res = await request(app).post('/api/orders/checkout').set(bearer(authToken)).send(delivery);
    expect(res.status).toBe(201);
    const orderId = res.body.order.id as string;

    mockConfirmEmail.mockClear();
    const { token: adminToken } = await createAdmin();
    const confirmed = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'CONFIRMED' });
    expect(confirmed.status).toBe(200);
    await flushAsync();

    expect(await prisma.orderAccessToken.count({ where: { orderID: orderId } })).toBe(0);
    const call = mockConfirmEmail.mock.calls.at(-1)!;
    const orderUrl = call[2] as string;
    expect(orderUrl).not.toContain('/orders/track/');
    expect(orderUrl).toContain(`/orders/${orderId}`);
  });
});

describe('GET /api/orders/track/:token', () => {
  it('returns the order for a valid token', async () => {
    const { orderId, trackingToken } = await placeOrder('track1@test.dev');
    const res = await request(app).get(`/api/orders/track/${trackingToken}`);
    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(orderId);
    expect(res.body.order.items).toHaveLength(1);
  });

  it('404s a garbage token', async () => {
    const res = await request(app).get('/api/orders/track/not-a-real-token');
    expect(res.status).toBe(404);
  });

  it('404s an expired token', async () => {
    const { orderId } = await placeOrder('track2@test.dev');
    // Directly mint an already-expired token to simulate one that's aged out
    // — same hashed construction as order.service.ts's mintAccessToken.
    const { createHash, randomBytes } = await import('node:crypto');
    const raw = randomBytes(32).toString('base64url');
    await prisma.orderAccessToken.create({
      data: {
        orderID: orderId,
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await request(app).get(`/api/orders/track/${raw}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/orders/lookup', () => {
  it('matches by order number + email, and mints a usable token', async () => {
    const { orderId, orderNumber } = await placeOrder('lookup1@test.dev');
    const res = await request(app).post('/api/orders/lookup').send({ orderNumber, contact: 'lookup1@test.dev' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    const track = await request(app).get(`/api/orders/track/${res.body.token}`);
    expect(track.status).toBe(200);
    expect(track.body.order.id).toBe(orderId);
  });

  it('matches by order number + phone too', async () => {
    const { orderNumber } = await placeOrder('lookup2@test.dev', '0799990000');
    const res = await request(app).post('/api/orders/lookup').send({ orderNumber, contact: '0799990000' });
    expect(res.status).toBe(200);
  });

  it('enumeration resistance: a wrong order number and a right order number + wrong contact produce identical responses', async () => {
    const { orderNumber } = await placeOrder('lookup3@test.dev');

    const wrongOrderNumber = await request(app)
      .post('/api/orders/lookup')
      .send({ orderNumber: 'AS-20990101-ZZZZZZ', contact: 'lookup3@test.dev' });
    const wrongContact = await request(app)
      .post('/api/orders/lookup')
      .send({ orderNumber, contact: 'someone-else@test.dev' });

    expect(wrongOrderNumber.status).toBe(wrongContact.status);
    expect(wrongOrderNumber.status).toBe(404);
    expect(wrongOrderNumber.body).toEqual(wrongContact.body);
  });

  it('a fresh lookup-minted token does not invalidate the original confirmation-issued one', async () => {
    const { orderId, orderNumber, trackingToken: originalToken } = await placeOrder('lookup4@test.dev');

    const lookup = await request(app)
      .post('/api/orders/lookup')
      .send({ orderNumber, contact: 'lookup4@test.dev' });
    expect(lookup.status).toBe(200);
    const mintedToken = lookup.body.token as string;
    expect(mintedToken).not.toBe(originalToken);

    // Both tokens work, independently, for the same order.
    const viaOriginal = await request(app).get(`/api/orders/track/${originalToken}`);
    const viaMinted = await request(app).get(`/api/orders/track/${mintedToken}`);
    expect(viaOriginal.status).toBe(200);
    expect(viaMinted.status).toBe(200);
    expect(viaOriginal.body.order.id).toBe(orderId);
    expect(viaMinted.body.order.id).toBe(orderId);

    expect(await prisma.orderAccessToken.count({ where: { orderID: orderId } })).toBe(2);
  });

  it('400s a malformed body', async () => {
    const res = await request(app).post('/api/orders/lookup').send({ orderNumber: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/orders/track/:token/cancel', () => {
  it('cancels a CONFIRMED order and restores stock, using the token as proof of access', async () => {
    const { orderId, trackingToken } = await placeOrder('cancel1@test.dev');
    const res = await request(app).post(`/api/orders/track/${trackingToken}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(10);

    const auditRows = await prisma.auditLog.findMany({
      where: { entityType: 'order', entityID: orderId, action: 'order.cancelled' },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ actorID: null, metadata: { via: 'guest_token' } });
  });

  it('respects the same CANCELLABLE_STATUSES gate as the session-based path', async () => {
    const { orderId, trackingToken } = await placeOrder('cancel2@test.dev');
    await prisma.order.update({ where: { id: orderId }, data: { status: 'SHIPPED' } });

    const res = await request(app).post(`/api/orders/track/${trackingToken}/cancel`);
    expect(res.status).toBe(409);
  });

  it('404s a garbage token', async () => {
    const res = await request(app).post('/api/orders/track/not-a-real-token/cancel');
    expect(res.status).toBe(404);
  });
});

describe('Rate limiting', () => {
  it('POST /lookup: an 11th request (varying order numbers) from one IP in the window is 429', async () => {
    const throttled = buildApp({ orderLookupRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await request(throttled)
        .post('/api/orders/lookup')
        .send({ orderNumber: `AS-20990101-AAAA0${i}`, contact: 'nobody@test.dev' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('POST /lookup: a 4th request for the same order number is 429, even across "IPs"', async () => {
    const throttled = buildApp({ orderLookupRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await request(throttled)
        .post('/api/orders/lookup')
        .set('X-Forwarded-For', `10.0.0.${i}`) // trust proxy is off outside prod — ignored
        .send({ orderNumber: 'AS-20990101-SAME01', contact: 'nobody@test.dev' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 3).every((s) => s === 404)).toBe(true);
    expect(statuses[3]).toBe(429);
  });

  it('GET /track/:token: an 11th request in the window is 429', async () => {
    const throttled = buildApp({ orderTrackRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await request(throttled).get(`/api/orders/track/garbage-${i}`);
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
