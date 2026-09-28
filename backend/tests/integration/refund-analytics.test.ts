import { collectTestOrder } from '../helpers/collection';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { salesDashboard } from '../../src/modules/orders/order.service';
import { bearer, createAdmin, createCustomer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
async function purchase(volume = false) {
  const buyer = await createCustomer();
  const admin = await createAdmin();
  const category = await makeCategory();
  const product = await makeProduct(category.id, {
    over: { price: volume ? 12 : 2 },
    variants: [{ stockQuantity: 30, size: 'M', color: 'Blue' }, { stockQuantity: 30, size: 'L', color: 'Red' }],
  });
  if (volume) await prisma.comboRule.create({ data: {
    nameEn: 'Bands', nameAr: 'Bands', pricingModel: 'UNIT_RATE_BANDS', status: 'ACTIVE',
    products: { create: { productID: product.id } },
    // Purchase-time worked example: the current save validator rejects its equal-total boundary.
    tiers: { create: [{ minQty: 3, maxQty: 4, price: 10 }, { minQty: 5, price: 8 }] },
  } });
  await prisma.coupon.create({ data: { code: 'REFUND', type: 'AMOUNT', value: volume ? 5.6 : 2 } });
  for (const variant of product.variants.slice(0, volume ? 1 : 2)) {
    await request(app).post('/api/cart/items').set(bearer(buyer.token))
      .send({ variantId: variant.id, quantity: volume ? 7 : 3 }).expect(201);
  }
  const result = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send({
    deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street',
    deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT', couponCode: 'REFUND',
  }).expect(201);
  const order = result.body.order;
  // Separate fee fixture; merchandise reports must never multiply or refund it.
  await prisma.order.update({ where: { id: order.id }, data: { deliveryFee: 4, total: volume ? 54.4 : 14 } });
  const status = (next: string) => request(app).patch(`/api/admin/orders/${order.id}/status`)
    .set(bearer(admin.token)).send({ status: next, ...(next === 'REFUNDED' ? { payout: { payerName: 'Test cashier' } } : {}) });
  for (const next of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) await status(next).expect(200);
  await collectTestOrder(order.id, admin.user.id);
  const report = async (name = 'overview', query = '') => (await request(app)
    .get(`/api/admin/analytics/${name}${query}`).set(bearer(admin.token)).expect(200)).body;
  const advance = async (id: string, statuses: string[]) => {
    for (const next of statuses) await request(app).patch(`/api/admin/returns/${id}/status`)
      .set(bearer(admin.token)).send({ status: next, ...(next === 'REFUNDED' ? { payout: { payerName: 'Test cashier' } } : {}) }).expect(200);
  };
  const submit = async (quantity: number) => (await request(app).post(`/api/orders/${order.id}/returns`)
    .set(bearer(buyer.token)).send({ items: [{ orderItemID: order.items[0].id, quantity }] }).expect(201)).body.return;
  return { buyer, admin, product, order, status, report, advance, submit };
}

describe('whole-order returns and refund-aware merchandise reports', () => {
  it.each(['normal', 'correction'])('records every line on a %s whole-order return, then nets to zero only when marked refunded', async (path) => {
    const p = await purchase();
    if (path === 'normal') await p.status('RETURNED').expect(200);
    else await request(app).patch(`/api/admin/orders/${p.order.id}/correction`).set(bearer(p.admin.token))
      .send({ status: 'RETURNED', expectedStatus: 'DELIVERED', reason: 'All goods received back' }).expect(200);
    const ret = await prisma.return.findFirstOrThrow({ where: { orderID: p.order.id }, include: { items: true } });
    expect(ret.status).toBe('RECEIVED');
    expect(Number(ret.refundAmount)).toBe(10);
    expect(ret.items).toHaveLength(2);
    for (const item of ret.items) {
      expect(item.quantity).toBe(3);
      expect(Number(item.refundAmount)).toBe(5); // rounded unitPrice is 1.67, but full refund is exactly 5
      expect(item.refundBreakdown).toMatchObject({ keptQuantity: 0, refundCents: 500 });
    }
    expect(await prisma.auditLog.count({ where: { entityID: ret.id, action: 'return.whole_order_received' } })).toBe(1);
    const beforeMarking = { merchandiseValue: 10, merchandiseMarkedRefunded: 0, netMerchandiseValue: 10,
      receivedReturnsAwaitingRefundMarking: 10, orderedUnits: 6, physicallyReturnedUnits: 6, retainedUnits: 0 };
    expect((await p.report()).kpis).toMatchObject({ ...beforeMarking, deliveryRevenue: 4, orders: 1 });
    expect((await salesDashboard()).merchandise).toMatchObject(beforeMarking);
    await p.status('RETURNED').expect(409);
    await p.advance(ret.id, ['REFUNDED']);
    expect(await prisma.return.count({ where: { orderID: p.order.id } })).toBe(1);
    expect((await p.report()).kpis).toMatchObject({ merchandiseMarkedRefunded: 10, netMerchandiseValue: 0,
      receivedReturnsAwaitingRefundMarking: 0, deliveryRevenue: 4 });
    expect((await salesDashboard()).totalRevenue).toBe(0);
    const sales = await p.report('sales');
    for (const key of ['byProduct', 'byCategory', 'bySize', 'byColour']) {
      expect(sales[key].reduce((sum: number, row: { revenue: number }) => sum + row.revenue, 0)).toBe(0);
      expect(sales[key].reduce((sum: number, row: { merchandiseMarkedRefunded: number }) => sum + row.merchandiseMarkedRefunded, 0)).toBe(10);
    }
    for (const variant of p.product.variants) {
      expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(30);
    }
    expect(await prisma.stockMovement.count({ where: { orderItem: { orderID: p.order.id }, type: 'RETURN' } })).toBe(2);
  });

  it('keeps physical receipts separate from requests and sums incremental recapture refunds without duplicating a line', async () => {
    const p = await purchase(true);
    const first = await p.submit(3);
    expect(Number(first.refundAmount)).toBe(14.4); // 56 * .9 - 4 * 10 * .9
    expect((await p.report()).kpis).toMatchObject({ merchandiseValue: 50.4, merchandiseMarkedRefunded: 0,
      netMerchandiseValue: 50.4, orderedUnits: 7, physicallyReturnedUnits: 0, retainedUnits: 7 });
    await p.advance(first.id, ['APPROVED', 'IN_TRANSIT', 'RECEIVED']);
    expect((await p.report()).kpis).toMatchObject({ netMerchandiseValue: 50.4,
      receivedReturnsAwaitingRefundMarking: 14.4, physicallyReturnedUnits: 3, retainedUnits: 4 });
    await p.advance(first.id, ['REFUNDED']);
    const second = await p.submit(2);
    expect(Number(second.refundAmount)).toBe(14.4);
    expect(second.items[0].refundBreakdown.cumulativeRefundCents).toBe(2880);
    await p.advance(second.id, ['APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REFUNDED']);
    const expected = { merchandiseValue: 50.4, merchandiseMarkedRefunded: 28.8, netMerchandiseValue: 21.6,
      receivedReturnsAwaitingRefundMarking: 0, orderedUnits: 7, physicallyReturnedUnits: 5, retainedUnits: 2 };
    expect((await p.report()).kpis).toMatchObject({ ...expected, deliveryRevenue: 4, orders: 1 });
    const sales = await p.report('sales');
    expect(sales.summary).toMatchObject(expected);
    expect(sales.revenueSeries).toHaveLength(1);
    expect(sales.revenueSeries[0]).toMatchObject({ revenue: 21.6, orders: 1 });
    for (const key of ['byProduct', 'byCategory', 'bySize', 'byColour']) expect(sales[key][0]).toMatchObject(expected);
    expect((await p.report('products')).products[0]).toMatchObject({ ...expected, revenue: 21.6, units: 2 });
    expect((await p.report('customers')).kpis.lifetimeValue).toBe(21.6);
    expect((await p.report('customers')).topCustomers[0].revenue).toBe(21.6);
    expect((await p.report('inventory')).kpis).toMatchObject({ orderedUnits: 7, physicallyReturnedUnits: 5, retainedUnits: 2 });
    expect((await salesDashboard()).merchandise).toMatchObject(expected);
    const last = await p.submit(2);
    await p.advance(last.id, ['APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REFUNDED']);
    expect((await p.report()).kpis).toMatchObject({ merchandiseMarkedRefunded: 50.4, netMerchandiseValue: 0, retainedUnits: 0, deliveryRevenue: 4 });
  });

  it('attributes later refund markings to the original order period and ignores rejected requests', async () => {
    const p = await purchase(true);
    const rejected = await p.submit(3);
    await p.advance(rejected.id, ['REJECTED']);
    const ret = await p.submit(3);
    await p.advance(ret.id, ['APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REFUNDED']);
    await prisma.order.update({ where: { id: p.order.id }, data: { dateCreated: new Date('2026-01-15T12:00:00Z') } });
    const query = '?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z';
    expect((await p.report('overview', query)).kpis).toMatchObject({ merchandiseMarkedRefunded: 14.4, netMerchandiseValue: 36, physicallyReturnedUnits: 3 });
    expect((await p.report('overview', '?from=2026-02-01T00:00:00Z&to=2026-02-28T23:59:59Z')).kpis)
      .toMatchObject({ merchandiseValue: 0, merchandiseMarkedRefunded: 0, netMerchandiseValue: 0, orderedUnits: 0 });
  });
});
