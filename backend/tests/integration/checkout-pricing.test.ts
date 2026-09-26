import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { bearer, createAdmin, createCustomer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';
import type { OrderItemPriceBreakdown } from '../../src/lib/checkout-pricing';

const app = buildApp();
const delivery = {
  deliveryName: 'Price Test', deliveryPhone: '0791234567',
  deliveryAddress: 'Test Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT',
};

async function checkoutCombo(quantity: number, groupSize: number, couponValue = 0) {
  const admin = await createAdmin();
  const customer = await createCustomer();
  const category = await makeCategory();
  const product = await makeProduct(category.id, {
    over: { price: 12 }, variants: [{ stockQuantity: 20 }],
  });
  await request(app).post('/api/combo-rules').set(bearer(admin.token)).send({
    nameEn: 'Exact prices', nameAr: 'Exact prices', status: 'ACTIVE', productIds: [product.id],
    tiers: [{ minQty: groupSize, maxQty: groupSize, price: 5 }],
  }).expect(201);
  if (couponValue) {
    await request(app).post('/api/coupons').set(bearer(admin.token))
      .send({ code: 'EXACT', type: 'AMOUNT', value: couponValue }).expect(201);
  }
  await request(app).post('/api/cart/items').set(bearer(customer.token))
    .send({ variantId: product.variants[0].id, quantity }).expect(201);
  const response = await request(app).post('/api/orders/checkout').set(bearer(customer.token))
    .send({ ...delivery, ...(couponValue ? { couponCode: 'EXACT' } : {}) }).expect(201);
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: response.body.order.id }, include: { items: true },
  });
  return { order, admin, product };
}

describe('checkout persists exact per-unit prices', () => {
  it('stores the coupon-adjusted combo line and keeps order totals and legacy analytics reconciled', async () => {
    const { order, admin, product } = await checkoutCombo(3, 2, 1.7);
    expect(order.items).toHaveLength(1);
    const item = order.items[0];
    expect(Number(order.subtotal)).toBe(17);
    expect(Number(order.discountAmount)).toBe(1.7);
    expect(Number(item.unitPrice)).toBe(5.1);
    expect(Number(item.lineTotal)).toBe(15.3);
    expect(item.priceBreakdown).toEqual({
      version: 1, beforeCouponLineTotalCents: 1700, unitPricesCents: [225, 225, 1080],
    });
    expect(Number(order.total)).toBeCloseTo(Number(item.lineTotal) + Number(order.deliveryFee), 2);

    // Historical orders have no breakdown and still contain pre-coupon
    // lineTotal. Both generations must agree with subtotal-based reports.
    await prisma.order.create({ data: {
      orderNumber: 'AS-LEGACY-PRICING', ...delivery, subtotal: 12, discountAmount: 2, total: 10,
      items: { create: {
        variantID: product.variants[0].id, productName: product.nameEn, productSKU: product.sku,
        variantSKU: product.variants[0].sku, quantity: 1, unitPrice: 12, lineTotal: 12,
      } },
    } });
    const overview = await request(app).get('/api/admin/analytics/overview').set(bearer(admin.token)).expect(200);
    expect(overview.body.kpis.revenue).toBe(29);
    const sales = await request(app).get('/api/admin/analytics/sales').set(bearer(admin.token)).expect(200);
    for (const key of ['byProduct', 'byCategory', 'bySize', 'byColour']) {
      expect(sales.body[key].reduce((sum: number, row: { revenue: number }) => sum + row.revenue, 0)).toBe(29);
    }
    expect(sales.body.revenueSeries.reduce((sum: number, row: { revenue: number }) => sum + row.revenue, 0)).toBe(29);
    const products = await request(app).get('/api/admin/analytics/products').set(bearer(admin.token)).expect(200);
    expect(products.body.products[0].revenue).toBe(29);
  });

  it('persists all three exact rounding shares of a 3-for-$5 line', async () => {
    const { order } = await checkoutCombo(3, 3);
    expect(order.items).toHaveLength(1);
    const breakdown = order.items[0].priceBreakdown as OrderItemPriceBreakdown;
    expect(breakdown.unitPricesCents).toEqual([167, 167, 166]);
    expect(breakdown.unitPricesCents.reduce((sum, cents) => sum + cents, 0)).toBe(500);
    expect(Number(order.items[0].lineTotal)).toBe(5);
    expect(Number(order.subtotal)).toBe(5);
  });
});
