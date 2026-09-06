import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

let adminToken: string;
let adminId: string;
let orderId: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });

  const admin = await createAdmin();
  adminToken = admin.token;
  adminId = admin.user.id;

  const agent = request.agent(app);
  await agent.post('/api/cart/items').send({ variantId: p.variants[0].id, quantity: 1 });
  const res = await agent.post('/api/orders/checkout').send({ ...delivery, guestEmail: 'j@test.dev' });
  orderId = res.body.order.id;
});

const auditRows = (action: string) =>
  prisma.auditLog.findMany({ where: { entityType: 'order', entityID: orderId, action } });

describe('order admin mutations write an AuditLog row', () => {
  it('records the actor + from/to on a status change', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);

    const rows = await auditRows('order.status_changed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorID: adminId });
    expect(rows[0].metadata).toMatchObject({ from: 'PENDING', to: 'CONFIRMED' });
  });

  it('records collected / uncollected toggles distinctly', async () => {
    await request(app)
      .patch(`/api/admin/orders/${orderId}/collected`)
      .set(bearer(adminToken))
      .send({ collected: true });
    await request(app)
      .patch(`/api/admin/orders/${orderId}/collected`)
      .set(bearer(adminToken))
      .send({ collected: false });

    expect(await auditRows('order.payment_collected')).toHaveLength(1);
    const off = await auditRows('order.payment_uncollected');
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ actorID: adminId });
    expect(off[0].metadata).toMatchObject({ from: 'COLLECTED', to: 'PENDING' });
  });

  it('does not write a row for a 404 (missing order)', async () => {
    const before = await prisma.auditLog.count();
    const res = await request(app)
      .patch('/api/admin/orders/00000000-0000-4000-8000-000000000000/status')
      .set(bearer(adminToken))
      .send({ status: 'SHIPPED' });
    expect(res.status).toBe(404);
    expect(await prisma.auditLog.count()).toBe(before);
  });
});
