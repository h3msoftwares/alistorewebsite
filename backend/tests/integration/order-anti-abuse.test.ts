import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, createUser, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return { ...actual, sendCheckoutOtpEmail: vi.fn().mockResolvedValue(true) };
});
import { sendCheckoutOtpEmail } from '../../src/lib/mailer';
const mockSendOtp = vi.mocked(sendCheckoutOtpEmail);

const app = buildApp();
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
  mockSendOtp.mockClear();
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 50 }],
  });
  variantId = p.variants[0].id;
});

/** Requests + verifies a checkout email-OTP for `email` and returns the
 *  ticket. Pass `token` for a logged-in caller (needed so the verify step
 *  can see req.user — e.g. to test the emailVerified-stamping side effect). */
async function getEmailVerifyToken(email: string, token?: string): Promise<string> {
  mockSendOtp.mockClear();
  const reqRes = await request(app)
    .post('/api/checkout/otp/request')
    .send({ email, captchaToken: HCAPTCHA_DUMMY_TOKEN });
  expect(reqRes.status).toBe(204);
  const code = mockSendOtp.mock.calls.at(-1)?.[1] as string;
  const verifyReq = request(app).post('/api/checkout/otp/verify');
  if (token) verifyReq.set(bearer(token));
  const verifyRes = await verifyReq.send({ email, code });
  expect(verifyRes.status).toBe(200);
  return verifyRes.body.verifyToken as string;
}

describe('Checkout OTP requirement — guest vs. logged-in', () => {
  it('guest checkout is rejected without an emailVerifyToken', async () => {
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent.post('/api/orders/checkout').send({ ...delivery, guestEmail: 'noverify@test.dev' });
    expect(res.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it('a verified logged-in user checks out with no emailVerifyToken at all', async () => {
    const { token } = await createCustomer(); // emailVerified defaults to true
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });
    const res = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
    expect(res.status).toBe(201);
    expect(mockSendOtp).not.toHaveBeenCalled(); // never needed the OTP flow at all
  });

  it('an unverified logged-in user is rejected without a token, then succeeds after verifying (which also stamps their account)', async () => {
    const { user, token } = await createUser({ emailVerified: false, email: 'unverified@test.dev' });
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });

    const rejected = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
    expect(rejected.status).toBe(400);

    const emailVerifyToken = await getEmailVerifyToken(user.email!, token);
    const ok = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(token))
      .send({ ...delivery, emailVerifyToken });
    expect(ok.status).toBe(201);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.emailVerified).not.toBeNull();
  });

  it('rejects an emailVerifyToken that was verified for a different email', async () => {
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const tokenForOther = await getEmailVerifyToken('other@test.dev');
    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, guestEmail: 'mismatch@test.dev', emailVerifyToken: tokenForOther });
    expect(res.status).toBe(401);
    expect(await prisma.order.count()).toBe(0);
  });
});

describe('BlacklistEntry hard-blocks', () => {
  it('blocks a checkout-OTP request for a blacklisted email — no email sent, same 429 shape as rate-limiting', async () => {
    await prisma.blacklistEntry.create({ data: { type: 'EMAIL', value: 'blocked@test.dev' } });
    const res = await request(app)
      .post('/api/checkout/otp/request')
      .send({ email: 'blocked@test.dev', captchaToken: HCAPTCHA_DUMMY_TOKEN });
    expect(res.status).toBe(429);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('blocks a checkout-OTP request for a blacklisted IP', async () => {
    // Learn this environment's req.ip from a throwaway request, then block it.
    await request(app)
      .post('/api/checkout/otp/request')
      .send({ email: 'probe@test.dev', captchaToken: HCAPTCHA_DUMMY_TOKEN });
    const probe = await prisma.checkoutOtp.findFirst({ where: { email: 'probe@test.dev' } });
    await prisma.blacklistEntry.create({ data: { type: 'IP', value: probe!.requestIP! } });

    mockSendOtp.mockClear();
    const res = await request(app)
      .post('/api/checkout/otp/request')
      .send({ email: 'behind-blocked-ip@test.dev', captchaToken: HCAPTCHA_DUMMY_TOKEN });
    expect(res.status).toBe(429);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('blocks checkout for a blacklisted phone, even with a valid OTP ticket — order is not created', async () => {
    await prisma.blacklistEntry.create({ data: { type: 'PHONE', value: delivery.deliveryPhone } });
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const emailVerifyToken = await getEmailVerifyToken('phoneblock@test.dev');

    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, guestEmail: 'phoneblock@test.dev', emailVerifyToken });
    expect(res.status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it('blocks checkout for a blacklisted email, even with an OTP ticket obtained before the block', async () => {
    // Obtain the ticket first — a blacklisted email can never get one at all
    // (the /request endpoint itself blocks it, tested above), so this
    // exercises the realistic ordering: verified, then blacklisted before
    // checking out. Proves order-creation's blacklist check is independent
    // of — not merely redundant with — the OTP-request gate.
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const emailVerifyToken = await getEmailVerifyToken('emailblock@test.dev');
    await prisma.blacklistEntry.create({ data: { type: 'EMAIL', value: 'emailblock@test.dev' } });

    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, guestEmail: 'emailblock@test.dev', emailVerifyToken });
    expect(res.status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });
});

describe('Order-velocity soft-flagging', () => {
  it('flags the order once the same phone crosses 3 in 24h, but still creates it every time', async () => {
    const { token } = await createCustomer();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });
      const res = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
      expect(res.status).toBe(201);
      expect(res.body.order.flaggedForReview).toBe(i === 2);
    }

    const flagged = await prisma.order.findMany({ where: { flaggedForReview: true } });
    expect(flagged).toHaveLength(1);
    expect(flagged[0].flaggedReason).toContain('velocity:phone');
    expect(await prisma.auditLog.count({ where: { action: 'order.flagged' } })).toBe(1);
  });

  it('flags via IP velocity (5 in 24h) even when phone and email differ every time', async () => {
    for (let i = 0; i < 5; i++) {
      const email = `ipvelocity-${i}@test.dev`;
      const agent = request.agent(app);
      await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
      const emailVerifyToken = await getEmailVerifyToken(email);

      const res = await agent.post('/api/orders/checkout').send({
        ...delivery,
        deliveryPhone: `0799${String(i).padStart(6, '0')}`,
        guestEmail: email,
        emailVerifyToken,
      });
      expect(res.status).toBe(201);
      expect(res.body.order.flaggedForReview).toBe(i === 4);
    }

    const flagged = await prisma.order.findMany({ where: { flaggedForReview: true } });
    expect(flagged).toHaveLength(1);
    expect(flagged[0].flaggedReason).toContain('velocity:ip');
  });

  it('does not flag below the threshold (2 orders, same phone)', async () => {
    const { token } = await createCustomer();
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });
      const res = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
      expect(res.body.order.flaggedForReview).toBe(false);
    }
  });
});

describe('Admin: flagged-order review', () => {
  it('lists only flagged orders with ?flagged=true, and PATCH /review clears the flag + audits it', async () => {
    const { token: buyerToken } = await createCustomer();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/cart/items').set(bearer(buyerToken)).send({ variantId, quantity: 1 });
      await request(app).post('/api/orders/checkout').set(bearer(buyerToken)).send(delivery);
    }
    const flaggedOrder = await prisma.order.findFirstOrThrow({ where: { flaggedForReview: true } });

    const { token: adminToken } = await createAdmin();
    const list = await request(app).get('/api/admin/orders?flagged=true').set(bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.orders).toHaveLength(1);
    expect(list.body.orders[0].id).toBe(flaggedOrder.id);

    const review = await request(app)
      .patch(`/api/admin/orders/${flaggedOrder.id}/review`)
      .set(bearer(adminToken));
    expect(review.status).toBe(200);
    expect(review.body.order.flaggedForReview).toBe(false);

    expect(await prisma.auditLog.count({ where: { action: 'order.flag_cleared', entityID: flaggedOrder.id } })).toBe(1);
    // The original flag event stays on record even after it's cleared.
    expect(await prisma.auditLog.count({ where: { action: 'order.flagged', entityID: flaggedOrder.id } })).toBe(1);
  });
});

describe('Blocked customer — cannot check out (admin Customers "block" toggle)', () => {
  it('a guest checkout with a blocked customer\'s email is refused', async () => {
    // Obtain the OTP ticket while the account is still active (simulating a
    // ticket grabbed just before the admin blocks them), then block, then
    // check out — isolates the checkout-layer defence from the OTP-layer one.
    const { user } = await createUser({ email: 'blocked-guest@test.dev', emailVerified: true });
    const ticket = await getEmailVerifyToken('blocked-guest@test.dev');
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, deliveryPhone: '0790000000', guestEmail: 'blocked-guest@test.dev', emailVerifyToken: ticket });

    expect(res.status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it('a guest checkout with a blocked customer\'s phone is refused (even with a fresh email)', async () => {
    const { user } = await createUser({ email: 'blocked-phone@test.dev', emailVerified: true });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false, phone: '0799999999' } });

    const ticket = await getEmailVerifyToken('someoneelse@test.dev');
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, deliveryPhone: '0799999999', guestEmail: 'someoneelse@test.dev', emailVerifyToken: ticket });

    expect(res.status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it('case-folding the blocked email does not bypass the check', async () => {
    const { user } = await createUser({ email: 'block-case@test.dev', emailVerified: true });
    // ticket for the lower-cased email (accounts + OTP rows are always stored
    // lower-cased), then block, then check out passing a MIXED-CASE guestEmail
    const ticket = await getEmailVerifyToken('block-case@test.dev');
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, deliveryPhone: '0790000001', guestEmail: 'Block-Case@Test.dev', emailVerifyToken: ticket });

    expect(res.status).toBe(403);
  });

  it('a customer blocked mid-session cannot finish an authenticated checkout', async () => {
    const { user, token } = await createCustomer(); // active + verified, gets a live access token
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });
    // admin blocks them while the access token is still valid
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
    expect(res.status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it('the checkout email-OTP request is refused for a blocked customer email', async () => {
    const { user } = await createUser({ email: 'block-otp@test.dev', emailVerified: true });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await request(app)
      .post('/api/checkout/otp/request')
      .send({ email: 'block-otp@test.dev', captchaToken: HCAPTCHA_DUMMY_TOKEN });

    expect(res.status).toBe(429); // generic throttle — same as a blacklist hit, no distinguishing error
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('unblocking restores guest checkout with that email', async () => {
    const { user } = await createUser({ email: 'unblock-me@test.dev', emailVerified: true });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });

    const ticket = await getEmailVerifyToken('unblock-me@test.dev');
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, guestEmail: 'unblock-me@test.dev', emailVerifyToken: ticket });

    expect(res.status).toBe(201);
  });
});
