import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, createStaffWith, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

// The mailer is the one real I/O boundary (SMTP) — mock just the checkout-OTP
// send so guest-checkout tests can pull the real code out of the mock call
// instead of needing a real inbox. Everything else in mailer.ts stays real
// (order-confirmation/owner-alert emails fire-and-forget and are unasserted
// here, same as before this feature existed).
vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return { ...actual, sendCheckoutOtpEmail: vi.fn().mockResolvedValue(true) };
});
import { sendCheckoutOtpEmail } from '../../src/lib/mailer';
const mockSendOtp = vi.mocked(sendCheckoutOtpEmail);

const app = buildApp();

let variantId: string;

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Amman',
  deliveryRegion: 'MOUNT_LEBANON',
};

// hCaptcha's own documented test secret (the app's default under test) only
// accepts this exact dummy passcode — any other token genuinely fails a real
// siteverify call. See backend/.env.example's HCAPTCHA_SECRET.
const HCAPTCHA_DUMMY_TOKEN = '10000000-aaaa-bbbb-cccc-000000000001';

/** Requests + verifies a checkout email-OTP for `email` and returns the
 *  resulting verifyToken, for tests that need a real one to check out with. */
async function getEmailVerifyToken(email: string): Promise<string> {
  mockSendOtp.mockClear();
  const reqRes = await request(app)
    .post('/api/checkout/otp/request')
    .send({ email, captchaToken: HCAPTCHA_DUMMY_TOKEN });
  expect(reqRes.status).toBe(204);
  const code = mockSendOtp.mock.calls.at(-1)?.[1] as string;
  const verifyRes = await request(app).post('/api/checkout/otp/verify').send({ email, code });
  expect(verifyRes.status).toBe(200);
  return verifyRes.body.verifyToken as string;
}

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory();
  const p = await makeProduct(cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });
  variantId = p.variants[0].id;
});

async function addToCart(agent: ReturnType<typeof request.agent>, quantity = 2) {
  const res = await agent.post('/api/cart/items').send({ variantId, quantity });
  expect(res.status).toBe(201);
}

describe('Orders API', () => {
  it('guest checkout: creates order, snapshots items, decrements stock, clears cart, writes SALE movement', async () => {
    const agent = request.agent(app);
    await addToCart(agent, 3);
    const emailVerifyToken = await getEmailVerifyToken('j@test.dev');

    const res = await agent
      .post('/api/orders/checkout')
      .send({ ...delivery, guestEmail: 'j@test.dev', emailVerifyToken });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PENDING');
    expect(res.body.order.paymentMethod).toBe('COD');
    expect(Number(res.body.order.total)).toBe(60);
    // No SiteSetting row in a fresh test DB ⇒ delivery fee engine is disabled.
    expect(Number(res.body.order.deliveryFee)).toBe(0);
    expect(Number(res.body.order.subtotal)).toBe(60);
    expect(res.body.order.deliveryRegion).toBe('MOUNT_LEBANON');
    expect(res.body.order.items[0]).toMatchObject({ quantity: 3, productName: 'Test Product' });

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(7);

    const movement = await prisma.stockMovement.findFirst({ where: { type: 'SALE' } });
    expect(movement).toMatchObject({ quantity: -3, orderID: res.body.order.id });

    expect((await agent.get('/api/cart')).body.items).toHaveLength(0);
  });

  it('rejects checkout with an empty cart (400)', async () => {
    const res = await request(app).post('/api/orders/checkout').send(delivery);
    expect(res.status).toBe(400);
  });

  it('rejects checkout missing delivery fields (400)', async () => {
    const agent = request.agent(app);
    await addToCart(agent);
    const res = await agent.post('/api/orders/checkout').send({ deliveryName: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects checkout with no / unknown deliveryRegion (400)', async () => {
    const agent = request.agent(app);
    await addToCart(agent);
    const { deliveryRegion, ...noRegion } = delivery;
    void deliveryRegion;
    expect((await agent.post('/api/orders/checkout').send(noRegion)).status).toBe(400);
    expect(
      (await agent.post('/api/orders/checkout').send({ ...delivery, deliveryRegion: 'ATLANTIS' }))
        .status
    ).toBe(400);
  });

  it('logged-in user: checkout, then list + fetch own orders', async () => {
    const { token } = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });

    const checkout = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(token))
      .send(delivery);
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.order.id;

    const mine = await request(app).get('/api/orders/mine').set(bearer(token));
    expect(mine.status).toBe(200);
    expect(mine.body.orders).toHaveLength(1);

    const detail = await request(app).get(`/api/orders/${orderId}`).set(bearer(token));
    expect(detail.status).toBe(200);
    expect(detail.body.order.id).toBe(orderId);

    // another customer cannot see it
    const { token: other } = await createCustomer();
    expect((await request(app).get(`/api/orders/${orderId}`).set(bearer(other))).status).toBe(404);
  });

  it('checkout rejects an addressId that belongs to another user (no cross-user address leak)', async () => {
    const victim = await createCustomer();
    const victimAddress = await prisma.address.create({
      data: {
        userID: victim.user.id,
        fullName: 'Victim Name',
        phone: '0799999999',
        addressLine: '99 Secret Lane',
        city: 'Amman',
        isDefault: true,
      },
    });

    const attacker = await createCustomer();
    await request(app)
      .post('/api/cart/items')
      .set(bearer(attacker.token))
      .send({ variantId, quantity: 1 });

    const res = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(attacker.token))
      .send({ ...delivery, addressId: victimAddress.id });

    expect(res.status).toBe(400);
    // nothing was created, so the attacker can't read the address back
    expect(await prisma.order.count({ where: { userID: attacker.user.id } })).toBe(0);
  });

  it('checkout accepts the buyer’s own addressId', async () => {
    const buyer = await createCustomer();
    const addr = await prisma.address.create({
      data: {
        userID: buyer.user.id,
        fullName: 'Buyer',
        phone: '0791111111',
        addressLine: '1 Own Street',
        city: 'Amman',
        isDefault: true,
      },
    });
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 1 });

    const res = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .send({ ...delivery, addressId: addr.id });

    expect(res.status).toBe(201);
    expect(res.body.order.addressID).toBe(addr.id);
  });

  it('a saved address with a short street line (min 3, as the address book allows) still checks out', async () => {
    const buyer = await createCustomer();
    const addr = await prisma.address.create({
      data: {
        userID: buyer.user.id,
        fullName: 'B',
        phone: '0791111111',
        addressLine: 'Maf', // 3 chars — valid per address.schema, was rejected by checkout's old min(5)
        city: 'Beirut',
        region: 'BEIRUT',
        isDefault: true,
      },
    });
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 1 });

    const res = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .send({
        addressId: addr.id,
        deliveryName: 'B',
        deliveryPhone: addr.phone,
        deliveryAddress: addr.addressLine,
        deliveryCity: addr.city,
        deliveryRegion: 'BEIRUT',
      });
    expect(res.status).toBe(201);
  });

  it('saveAddress: a signed-in shopper who types a fresh address gets it kept in their address book', async () => {
    const buyer = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 1 });

    const res = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .send({
        ...delivery,
        deliveryPhone: '0795555555',
        deliveryAddress: '5 Cedar Ave',
        deliveryCity: 'Zahle',
        deliveryRegion: 'BEQAA',
        deliveryArea: 'Ksara',
        saveAddress: true,
      });
    expect(res.status).toBe(201);

    const saved = await prisma.address.findMany({ where: { userID: buyer.user.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      phone: '0795555555',
      addressLine: '5 Cedar Ave',
      city: 'Zahle',
      region: 'BEQAA',
      area: 'Ksara',
      isDefault: true, // first address
    });
  });

  it('saveAddress is ignored for a guest and when an addressId is supplied', async () => {
    const guestAgent = request.agent(app);
    await addToCart(guestAgent, 1);
    const emailVerifyToken = await getEmailVerifyToken('g@test.dev');
    expect(
      (
        await guestAgent
          .post('/api/orders/checkout')
          .send({ ...delivery, guestEmail: 'g@test.dev', saveAddress: true, emailVerifyToken })
      ).status
    ).toBe(201);

    const buyer = await createCustomer();
    const addr = await prisma.address.create({
      data: { userID: buyer.user.id, fullName: 'B', phone: '0791111111', addressLine: '1 St', city: 'Amman', isDefault: true },
    });
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 1 });
    await request(app)
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .send({ ...delivery, addressId: addr.id, saveAddress: true });

    expect(await prisma.address.count({ where: { userID: buyer.user.id } })).toBe(1);
  });

  it('cancel: pending-only, restores stock and records a RETURN movement', async () => {
    const { token } = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 4 });
    const checkout = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
    const orderId = checkout.body.order.id;

    expect((await prisma.productVariant.findUnique({ where: { id: variantId } }))?.stockQuantity).toBe(6);

    const cancel = await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('CANCELLED');
    expect((await prisma.productVariant.findUnique({ where: { id: variantId } }))?.stockQuantity).toBe(10);
    expect(await prisma.stockMovement.count({ where: { type: 'RETURN' } })).toBe(1);

    // cannot cancel twice
    expect((await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(token))).status).toBe(409);
  });

  it('order history/detail require auth', async () => {
    expect((await request(app).get('/api/orders/mine')).status).toBe(401);
  });

  describe('admin order management', () => {
    it('lists all orders, filters by status, and rejects a bad status value', async () => {
      // A verified logged-in customer, not a guest — this test is about admin
      // listing/filtering, not checkout mechanics, so it skips the email-OTP
      // flow that a guest checkout would now require.
      const buyer = await createCustomer();
      await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 1 });
      await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send(delivery);
      const { token } = await createAdmin();

      const all = await request(app).get('/api/admin/orders').set(bearer(token));
      expect(all.status).toBe(200);
      expect(all.body.orders).toHaveLength(1);

      const pending = await request(app).get('/api/admin/orders?status=PENDING').set(bearer(token));
      expect(pending.body.orders).toHaveLength(1);
      const delivered = await request(app).get('/api/admin/orders?status=DELIVERED').set(bearer(token));
      expect(delivered.body.orders).toHaveLength(0);

      expect((await request(app).get('/api/admin/orders?status=NOPE').set(bearer(token))).status).toBe(400);
    });

    it('filters by a comma-separated status list, and by awaitingCod', async () => {
      const admin = await createAdmin();

      const buyerA = await createCustomer();
      await request(app).post('/api/cart/items').set(bearer(buyerA.token)).send({ variantId, quantity: 1 });
      const orderA = (await request(app).post('/api/orders/checkout').set(bearer(buyerA.token)).send(delivery)).body
        .order;
      await request(app)
        .patch(`/api/admin/orders/${orderA.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'CONFIRMED' });

      const buyerB = await createCustomer();
      await request(app).post('/api/cart/items').set(bearer(buyerB.token)).send({ variantId, quantity: 1 });
      const orderB = (await request(app).post('/api/orders/checkout').set(bearer(buyerB.token)).send(delivery)).body
        .order;
      for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED'] as const) {
        await request(app)
          .patch(`/api/admin/orders/${orderB.id}/status`)
          .set(bearer(admin.token))
          .send({ status });
      }
      // orderB is now DELIVERED, COD, and not yet marked collected.

      const inTransit = await request(app)
        .get('/api/admin/orders?status=CONFIRMED,SHIPPED')
        .set(bearer(admin.token));
      expect(inTransit.body.orders.map((o: { id: string }) => o.id)).toEqual([orderA.id]);

      const awaitingCod = await request(app).get('/api/admin/orders?awaitingCod=true').set(bearer(admin.token));
      expect(awaitingCod.body.orders.map((o: { id: string }) => o.id)).toEqual([orderB.id]);

      // awaitingCod takes precedence over an (incompatible) explicit status.
      const both = await request(app)
        .get('/api/admin/orders?status=PENDING&awaitingCod=true')
        .set(bearer(admin.token));
      expect(both.body.orders.map((o: { id: string }) => o.id)).toEqual([orderB.id]);
    });

    it('updates status and marks COD collected; dashboard aggregates', async () => {
      const buyer = await createCustomer();
      await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 2 });
      const checkout = await request(app)
        .post('/api/orders/checkout')
        .set(bearer(buyer.token))
        .send(delivery);
      const orderId = checkout.body.order.id;
      // Fulfilment work (status change, mark COD collected) is STAFF-reachable…
      const { token } = await createStaffWith(['orders:manage']);

      const status = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set(bearer(token))
        .send({ status: 'DELIVERED' });
      expect(status.status).toBe(200);
      expect(status.body.order.status).toBe('DELIVERED');

      const collected = await request(app)
        .patch(`/api/admin/orders/${orderId}/collected`)
        .set(bearer(token))
        .send({ collected: true });
      expect(collected.body.order.paymentStatus).toBe('COLLECTED');

      // …but the revenue dashboard is ADMIN-only since S4.
      const { token: adminToken } = await createAdmin();
      const dash = await request(app).get('/api/admin/dashboard').set(bearer(adminToken));
      expect(dash.body).toMatchObject({
        totalOrders: 1,
        pendingOrders: 0,
        flaggedOrders: 0,
        // order is DELIVERED and COD was marked collected above
        awaitingCodCollection: 0,
        // order is DELIVERED, not CONFIRMED/SHIPPED
        confirmedNotDelivered: 0,
        lowStockVariants: expect.any(Number),
        outOfStockVariants: expect.any(Number),
      });
      expect(dash.body.totalRevenue).toBe(40);
      expect(dash.body.recentOrders).toHaveLength(1);
      expect(dash.body.recentOrders[0]).toMatchObject({ id: orderId, status: 'DELIVERED' });
    });

    it('admin routes reject anon (401) and customer (403)', async () => {
      expect((await request(app).get('/api/admin/orders')).status).toBe(401);
      const { token } = await createCustomer();
      expect((await request(app).get('/api/admin/orders').set(bearer(token))).status).toBe(403);
    });
  });
});
