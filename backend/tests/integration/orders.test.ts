import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, createStaff, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let variantId: string;

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Amman',
};

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
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

    const res = await agent.post('/api/orders/checkout').send({ ...delivery, guestEmail: 'j@test.dev' });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PENDING');
    expect(res.body.order.paymentMethod).toBe('COD');
    expect(Number(res.body.order.total)).toBe(60);
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
      const agent = request.agent(app);
      await addToCart(agent);
      await agent.post('/api/orders/checkout').send(delivery);
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

    it('updates status and marks COD collected; dashboard aggregates', async () => {
      const agent = request.agent(app);
      await addToCart(agent, 2);
      const checkout = await agent.post('/api/orders/checkout').send(delivery);
      const orderId = checkout.body.order.id;
      const { token } = await createStaff();

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

      const dash = await request(app).get('/api/admin/dashboard').set(bearer(token));
      expect(dash.body).toMatchObject({ totalOrders: 1, pendingOrders: 0 });
      expect(dash.body.totalRevenue).toBe(40);
    });

    it('admin routes reject anon (401) and customer (403)', async () => {
      expect((await request(app).get('/api/admin/orders')).status).toBe(401);
      const { token } = await createCustomer();
      expect((await request(app).get('/api/admin/orders').set(bearer(token))).status).toBe(403);
    });
  });
});
