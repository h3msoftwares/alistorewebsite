import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import type { ReturnStatus } from '@prisma/client';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { ALL_PERMISSIONS, effectivePermissions } from '../../src/lib/permissions';
import { bearer, createAdmin, createCustomer, createStaffWith, signAccessToken } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';
import { collectTestOrder } from '../helpers/collection';

const app = buildApp();
const transitions: [ReturnStatus, ReturnStatus][] = [
  ['REQUESTED', 'APPROVED'], ['REQUESTED', 'REJECTED'], ['REQUESTED', 'CANCELLED'],
  ['APPROVED', 'IN_TRANSIT'], ['APPROVED', 'CANCELLED'], ['IN_TRANSIT', 'RECEIVED'],
  ['IN_TRANSIT', 'CANCELLED'], ['RECEIVED', 'REFUNDED'],
];
async function purchase() {
  const buyer = await createCustomer(); const admin = await createAdmin();
  const category = await makeCategory();
  const product = await makeProduct(category.id, { over: { price: 20 }, variants: [{ stockQuantity: 8 }] });
  const variant = product.variants[0];
  const order = await prisma.order.create({ data: {
    orderNumber: `TEST-${randomUUID()}`, userID: buyer.user.id, status: 'DELIVERED',
    deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut',
    subtotal: 40, deliveryFee: 10, total: 50,
    items: { create: { variantID: variant.id, productName: product.nameEn, productSKU: product.sku,
      variantSKU: variant.sku, quantity: 2, unitPrice: 20, lineTotal: 40 } },
  }, include: { items: true } });
  const body = { items: [{ orderItemID: order.items[0].id, quantity: 1 }] };
  const create = (token: string) => request(app).post(`/api/admin/orders/${order.id}/returns`).set(bearer(token)).send(body);
  const preview = (token: string) => request(app).post(`/api/admin/orders/${order.id}/returns/preview`).set(bearer(token)).send(body);
  const ret = async (status: ReturnStatus) => {
    const result = await request(app).post(`/api/orders/${order.id}/returns`).set(bearer(buyer.token)).send(body).expect(201);
    return prisma.return.update({ where: { id: result.body.return.id }, data: { status } });
  };
  const mark = (id: string, status: ReturnStatus, token: string, extra = {}) => request(app)
    .patch(`/api/admin/returns/${id}/status`).set(bearer(token)).send({ status, ...extra });
  return { buyer, admin, variant, order, body, create, preview, ret, mark };
}

describe('independent return and refund permissions', () => {
  it('adds the catalog keys, implies view, gives ADMIN all and respects revocations', () => {
    expect(ALL_PERMISSIONS).toEqual(expect.arrayContaining(['returns:view', 'returns:manage', 'refunds:view', 'refunds:manage']));
    expect(effectivePermissions({ role: 'ADMIN' })).toEqual(new Set(ALL_PERMISSIONS));
    expect(effectivePermissions({ role: 'STAFF', rolePermissions: ['returns:manage', 'refunds:manage'] }))
      .toEqual(new Set(['returns:manage', 'returns:view', 'refunds:manage', 'refunds:view']));
    const revoked = effectivePermissions({ role: 'ADMIN', revoked: ['returns:manage', 'refunds:manage'] });
    expect(revoked.has('returns:manage')).toBe(false); expect(revoked.has('refunds:manage')).toBe(false);
  });

  it.each(transitions)('gates %s -> %s independently and still requires fresh authentication', async (from, to) => {
    const p = await purchase(); const ret = await p.ret(from);
    await collectTestOrder(p.order.id, p.admin.user.id);
    const permission = to === 'REFUNDED' ? 'refunds:manage' : 'returns:manage';
    for (const keys of [[], ['orders:manage'], ['payments:manage'], ['returns:view'], ['refunds:view'],
      [to === 'REFUNDED' ? 'returns:manage' : 'refunds:manage']]) {
      const denied = await createStaffWith(keys);
      await p.mark(ret.id, to, denied.token).expect(403);
    }
    expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe(from);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variant.id } })).stockQuantity).toBe(8);
    const allowed = await createStaffWith([permission]);
    const stale = signAccessToken(allowed.user.id, 'STAFF', Math.floor(Date.now() / 1000) - 3600);
    const blocked = await p.mark(ret.id, to, stale).expect(403);
    expect(blocked.body.error.code).toBe('STEP_UP_REQUIRED');
    await p.mark(ret.id, to, allowed.token).expect(200);
    expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe(to);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variant.id } })).stockQuantity).toBe(to === 'RECEIVED' ? 9 : 8);
  });

  it('refunds:manage alone can adjust merchandise and delivery but cannot handle returns or collect cash', async () => {
    const p = await purchase(); const ret = await p.ret('RECEIVED');
    const refunder = await createStaffWith(['refunds:manage']);
    await p.mark(ret.id, 'REFUNDED', refunder.token).expect(409); // no collection evidence
    await request(app).patch(`/api/admin/orders/${p.order.id}/collected`).set(bearer(refunder.token))
      .send({ collected: true, amount: 50, currency: 'USD', collectedAt: new Date().toISOString(), collectorName: 'Courier' }).expect(403);
    await collectTestOrder(p.order.id, p.admin.user.id);
    await p.mark(ret.id, 'REFUNDED', refunder.token, { merchandiseRefundCents: 1000,
      refundAdjustmentReason: 'Agreed amount', deliveryRefundCents: 500, deliveryRefundReason: 'Delivery issue' }).expect(200);
    const saved = await prisma.return.findUniqueOrThrow({ where: { id: ret.id } });
    expect(Number(saved.refundedAmount)).toBe(10); expect(Number(saved.deliveryRefundAmount)).toBe(5);
    await p.create(refunder.token).expect(403); await p.preview(refunder.token).expect(403);
  });

  it('admin return creation needs returns:manage and fresh auth; its preview remains read-only', async () => {
    const p = await purchase();
    for (const keys of [[], ['orders:manage'], ['returns:view'], ['refunds:manage'], ['payments:manage']]) {
      const denied = await createStaffWith(keys); await p.create(denied.token).expect(403); await p.preview(denied.token).expect(403);
    }
    const handler = await createStaffWith(['returns:manage']);
    const stale = signAccessToken(handler.user.id, 'STAFF', Math.floor(Date.now() / 1000) - 3600);
    await p.preview(stale).expect(200);
    const blocked = await p.create(stale).expect(403); expect(blocked.body.error.code).toBe('STEP_UP_REQUIRED');
    await p.create(handler.token).expect(201);
    expect(handler.role.permissions).toEqual(['returns:manage']);
  });

  it.each(['status', 'correction'])('covers legacy whole-order %s creation with both handling and order permissions', async route => {
    const p = await purchase();
    const change = (token: string) => request(app).patch(`/api/admin/orders/${p.order.id}/${route}`).set(bearer(token))
      .send({ status: 'RETURNED', ...(route === 'correction' ? { expectedStatus: 'DELIVERED', reason: 'Customer returned order' } : {}) });
    const correction = route === 'correction' ? ['order_corrections:manage'] : [];
    for (const keys of [correction, ['orders:manage', ...correction], ['returns:manage', ...correction], ['refunds:manage', ...correction]]) {
      const staff = await createStaffWith(keys); await change(staff.token).expect(403);
    }
    expect(await prisma.return.count({ where: { orderID: p.order.id } })).toBe(0);
    const staff = await createStaffWith(['orders:manage', 'returns:manage', ...correction]);
    const stale = signAccessToken(staff.user.id, 'STAFF', Math.floor(Date.now() / 1000) - 3600);
    expect((await change(stale).expect(403)).body.error.code).toBe('STEP_UP_REQUIRED');
    await change(staff.token).expect(200);
    expect(await prisma.return.count({ where: { orderID: p.order.id, status: 'RECEIVED' } })).toBe(1);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variant.id } })).stockQuantity).toBe(10);
  });

  it('requires returns:view for the list while embedded order returns, indicators and counts retain orders:view', async () => {
    const p = await purchase(); await p.ret('REQUESTED');
    const orderViewer = await createStaffWith(['orders:view']); const returnViewer = await createStaffWith(['returns:view']);
    await request(app).get('/api/admin/returns').set(bearer(orderViewer.token)).expect(403);
    const list = await request(app).get('/api/admin/returns').set(bearer(returnViewer.token)).expect(200);
    expect(list.body.returns).toHaveLength(1);
    const detail = await request(app).get(`/api/orders/${p.order.id}`).set(bearer(orderViewer.token)).expect(200);
    expect(detail.body.order.returns).toHaveLength(1);
    const orders = await request(app).get('/api/admin/orders').set(bearer(orderViewer.token)).expect(200);
    expect(orders.body.orders[0].returnIndicators).toBeDefined();
    await request(app).get('/api/admin/orders/return-work').set(bearer(orderViewer.token)).expect(200);
    await request(app).get(`/api/orders/${p.order.id}`).set(bearer(returnViewer.token)).expect(403);
  });

  it.each(['STAFF', 'ADMIN'] as const)('respects per-user revocations for %s on reads and both write areas', async role => {
    const p = await purchase(); const ret = await p.ret('REQUESTED');
    const actor = role === 'ADMIN' ? await createAdmin() : await createStaffWith(['returns:manage', 'refunds:manage']);
    await prisma.user.update({ where: { id: actor.user.id }, data: { revokedPermissions: ['returns:view', 'returns:manage', 'refunds:manage'] } });
    await request(app).get('/api/admin/returns').set(bearer(actor.token)).expect(403);
    await p.create(actor.token).expect(403); await p.mark(ret.id, 'APPROVED', actor.token).expect(403);
    await p.mark(ret.id, 'REFUNDED', actor.token).expect(403);
    await prisma.user.update({ where: { id: actor.user.id }, data: { revokedPermissions: ['returns:view'] } });
    await request(app).get('/api/admin/returns').set(bearer(actor.token)).expect(403);
    await p.mark(ret.id, 'APPROVED', actor.token).expect(200);
  });

  it('leaves owned customer and valid guest-token requests, previews and cancellation independent of staff permissions', async () => {
    const p = await purchase();
    const customer = await request(app).post(`/api/orders/${p.order.id}/returns/preview`).set(bearer(p.buyer.token)).send(p.body).expect(200);
    expect(customer.body.refundCents).toBe(2000);
    const ret = await p.ret('REQUESTED');
    await request(app).post(`/api/orders/${p.order.id}/returns/${ret.id}/cancel`).set(bearer(p.buyer.token)).expect(200);
    const token = 'valid-guest-return-token';
    await prisma.orderAccessToken.create({ data: { orderID: p.order.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
    await request(app).post(`/api/orders/track/${token}/returns/preview`).send(p.body).expect(200);
    const guest = await request(app).post(`/api/orders/track/${token}/returns`).send(p.body).expect(201);
    await request(app).post(`/api/orders/track/${token}/returns/${guest.body.return.id}/cancel`).expect(200);
  });
});
