import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createStaffWith, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return { ...actual, sendOrderShippedEmail: vi.fn().mockResolvedValue(true) };
});
import { sendOrderShippedEmail } from '../../src/lib/mailer';
const mockShippedEmail = vi.mocked(sendOrderShippedEmail);

const app = buildApp();

let variantId: string;
const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

beforeEach(async () => {
  mockShippedEmail.mockClear();
  const col = await makeCollection({ slug: 'ship-c' });
  const cat = await makeCategory();
  const p = await makeProduct(cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'sv1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });
  variantId = p.variants[0].id;
});

async function placeOrder() {
  const { token } = await createCustomer();
  await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });
  const res = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
  expect(res.status).toBe(201);
  return res.body.order.id as string;
}

// A short poll — the shipped email fires void-and-catch after the response.
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 50));
}

describe('Order shipping — estimate + customer email', () => {
  it('moving an order to SHIPPED stores the estimate and emails the customer once', async () => {
    const orderId = await placeOrder();
    const { token: staff } = await createStaffWith(['orders:manage']);

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(staff))
      .send({ status: 'SHIPPED', estimatedDeliveryDays: 3 });
    expect(res.status).toBe(200);
    expect(res.body.order.estimatedDeliveryDays).toBe(3);

    await flushAsync();
    expect(mockShippedEmail).toHaveBeenCalledTimes(1);
    expect(mockShippedEmail.mock.calls[0][2]).toBe(3); // estimatedDeliveryDays arg

    const audit = await prisma.auditLog.findFirst({
      where: { entityID: orderId, action: 'order.status_changed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({ to: 'SHIPPED', estimatedDeliveryDays: 3 });
  });

  it('does not re-email when SHIPPED is re-selected, and a later status change can revise the estimate', async () => {
    const orderId = await placeOrder();
    const { token: staff } = await createStaffWith(['orders:manage']);
    const ship = (body: unknown) =>
      request(app).patch(`/api/admin/orders/${orderId}/status`).set(bearer(staff)).send(body);

    await ship({ status: 'SHIPPED', estimatedDeliveryDays: 2 });
    await flushAsync();
    expect(mockShippedEmail).toHaveBeenCalledTimes(1);

    // Re-selecting SHIPPED (e.g. to change the estimate) must not send again.
    const again = await ship({ status: 'SHIPPED', estimatedDeliveryDays: 5 });
    expect(again.body.order.estimatedDeliveryDays).toBe(5);
    await flushAsync();
    expect(mockShippedEmail).toHaveBeenCalledTimes(1);
  });

  it('omitting estimatedDeliveryDays on a status change leaves the stored value untouched', async () => {
    const orderId = await placeOrder();
    const { token: staff } = await createStaffWith(['orders:manage']);
    const ship = (body: unknown) =>
      request(app).patch(`/api/admin/orders/${orderId}/status`).set(bearer(staff)).send(body);

    await ship({ status: 'SHIPPED', estimatedDeliveryDays: 4 });
    const moved = await ship({ status: 'DELIVERED' });
    expect(moved.body.order.estimatedDeliveryDays).toBe(4);
  });

  it('rejects a negative or absurd estimate (400)', async () => {
    const orderId = await placeOrder();
    const { token: staff } = await createStaffWith(['orders:manage']);
    for (const bad of [-1, 500, 3.5]) {
      const res = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set(bearer(staff))
        .send({ status: 'SHIPPED', estimatedDeliveryDays: bad });
      expect(res.status, `days=${bad}`).toBe(400);
    }
  });
});
