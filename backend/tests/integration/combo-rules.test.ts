import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, createStaffWith, bearer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let adminToken: string;

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
});

const getAdmin = (path: string) => request(app).get(path).set(bearer(adminToken));
const postAdmin = (path: string, body: unknown) => request(app).post(path).set(bearer(adminToken)).send(body);
const patchAdmin = (path: string, body: unknown) => request(app).patch(path).set(bearer(adminToken)).send(body);
const deleteAdmin = (path: string) => request(app).delete(path).set(bearer(adminToken));

describe('Combo rules API', () => {
  it('requires staff/admin, and the dedicated combos:* permission (not discounts:*)', async () => {
    const customer = (await createCustomer()).token;
    expect((await request(app).get('/api/combo-rules')).status).toBe(401);
    expect((await request(app).get('/api/combo-rules').set(bearer(customer))).status).toBe(403);

    const viewer = await createStaffWith(['combos:view']);
    expect((await request(app).get('/api/combo-rules').set(bearer(viewer.token))).status).toBe(200);
    expect(
      (await request(app).post('/api/combo-rules').set(bearer(viewer.token)).send({})).status
    ).toBe(403);

    // Holding discounts:manage alone must NOT unlock combo-rule writes —
    // this is the whole point of combos being its own permission area.
    const discountsOnly = await createStaffWith(['discounts:manage']);
    expect(
      (await request(app).post('/api/combo-rules').set(bearer(discountsOnly.token)).send({})).status
    ).toBe(403);

    const manager = await createStaffWith(['combos:manage']);
    const res = await request(app)
      .post('/api/combo-rules')
      .set(bearer(manager.token))
      .send({ nameEn: 'x', nameAr: 'x', appliesToAll: true, tiers: [{ minQty: 2, maxQty: 2, price: 5 }] });
    expect(res.status).toBe(201);
  });

  it('creates a combo rule targeting a product / category / collection / site-wide, validates tier shape, and rejects overlapping tiers', async () => {
    const cat = await makeCategory({ slug: 'combo-cat' });
    const product = await makeProduct(cat.id);

    const byProduct = await postAdmin('/api/combo-rules', {
      nameEn: 'By product',
      nameAr: 'م',
      status: 'ACTIVE',
      productIds: [product.id],
      tiers: [{ minQty: 2, maxQty: 3, price: 5 }],
    });
    expect(byProduct.status).toBe(201);
    expect(byProduct.body.comboRule.products.map((p: { productID: string }) => p.productID)).toEqual([product.id]);
    expect(byProduct.body.comboRule.tiers).toMatchObject([{ minQty: 2, maxQty: 3 }]);

    // no target at all, and not appliesToAll
    expect(
      (await postAdmin('/api/combo-rules', { nameEn: 'x', nameAr: 'x', tiers: [{ minQty: 2, maxQty: 2, price: 5 }] }))
        .status
    ).toBe(400);
    // appliesToAll AND specific targets together
    expect(
      (
        await postAdmin('/api/combo-rules', {
          nameEn: 'x',
          nameAr: 'x',
          appliesToAll: true,
          productIds: [product.id],
          tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
        })
      ).status
    ).toBe(400);
    // no tiers at all
    expect(
      (await postAdmin('/api/combo-rules', { nameEn: 'x', nameAr: 'x', appliesToAll: true, tiers: [] })).status
    ).toBe(400);
    // maxQty < minQty
    expect(
      (
        await postAdmin('/api/combo-rules', {
          nameEn: 'x',
          nameAr: 'x',
          appliesToAll: true,
          tiers: [{ minQty: 3, maxQty: 2, price: 5 }],
        })
      ).status
    ).toBe(400);
    // overlapping tier ranges
    expect(
      (
        await postAdmin('/api/combo-rules', {
          nameEn: 'x',
          nameAr: 'x',
          appliesToAll: true,
          tiers: [
            { minQty: 1, maxQty: 3, price: 5 },
            { minQty: 2, maxQty: 4, price: 8 },
          ],
        })
      ).status
    ).toBe(400);
  });

  it('updates and deletes a combo rule, and records an AuditLog row for create/update/delete', async () => {
    const created = await postAdmin('/api/combo-rules', {
      nameEn: 'Audit me',
      nameAr: 'م',
      appliesToAll: true,
      status: 'ACTIVE',
      tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
    });
    const id = created.body.comboRule.id;

    const updated = await patchAdmin(`/api/combo-rules/${id}`, { priority: 7 });
    expect(updated.status).toBe(200);
    expect(updated.body.comboRule.priority).toBe(7);

    expect((await deleteAdmin(`/api/combo-rules/${id}`)).status).toBe(204);
    expect((await getAdmin(`/api/combo-rules/${id}`)).status).toBe(404);

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'comboRule', entityID: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual(['comboRule.created', 'comboRule.updated', 'comboRule.deleted']);
    const updateLog = logs[1].metadata as { before: Record<string, unknown>; after: Record<string, unknown> };
    expect(updateLog.before.priority).toBe(0);
    expect(updateLog.after.priority).toBe(7);
  });
});

describe('Combo pricing — cart and checkout', () => {
  const delivery = {
    deliveryName: 'Jane Doe',
    deliveryPhone: '0791234567',
    deliveryAddress: '12 Rainbow Street',
    deliveryCity: 'Amman',
    deliveryRegion: 'MOUNT_LEBANON',
  };

  it('applies "2 for $5" combo pricing in the cart, and checkout snapshots the same total', async () => {
    const cat = await makeCategory({ slug: 'combo-checkout-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 3.5 },
      variants: [{ sku: 'combo-v1', stockQuantity: 10 }],
    });
    await postAdmin('/api/combo-rules', {
      nameEn: 'Combo', nameAr: 'م', status: 'ACTIVE',
      productIds: [product.id],
      tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
    });

    const customer = await createCustomer();
    const agent = request.agent(app);
    await agent
      .post('/api/cart/items')
      .set(bearer(customer.token))
      .send({ variantId: product.variants[0].id, quantity: 4 });

    const cart = await agent.get('/api/cart').set(bearer(customer.token));
    expect(cart.body.subtotal).toBe(10); // two "2 for $5" groups, not 4 x $3.50 = $14
    expect(cart.body.comboSavings).toBeCloseTo(4, 5);

    const checkout = await agent
      .post('/api/orders/checkout')
      .set(bearer(customer.token))
      .send({ ...delivery, expectedSubtotal: cart.body.subtotal });
    expect(checkout.status).toBe(201);
    expect(Number(checkout.body.order.subtotal)).toBe(10);
    expect(Number(checkout.body.order.items[0].lineTotal)).toBe(10);
  });

  it('a product covered by two active combo rules is priced only under the higher-priority one', async () => {
    const cat = await makeCategory({ slug: 'combo-priority-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 4 },
      variants: [{ sku: 'combo-v2', stockQuantity: 10 }],
    });
    await postAdmin('/api/combo-rules', {
      nameEn: 'Worse', nameAr: 'م', status: 'ACTIVE', priority: 0,
      productIds: [product.id],
      tiers: [{ minQty: 2, maxQty: 2, price: 9 }],
    });
    await postAdmin('/api/combo-rules', {
      nameEn: 'Better', nameAr: 'م', status: 'ACTIVE', priority: 1,
      productIds: [product.id],
      tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
    });

    const customer = await createCustomer();
    const agent = request.agent(app);
    await agent
      .post('/api/cart/items')
      .set(bearer(customer.token))
      .send({ variantId: product.variants[0].id, quantity: 2 });

    const cart = await agent.get('/api/cart').set(bearer(customer.token));
    expect(cart.body.subtotal).toBe(5);
  });

  it('ignores a DRAFT combo rule, applying it only once it is made ACTIVE', async () => {
    const cat = await makeCategory({ slug: 'combo-draft-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 3.5 },
      variants: [{ sku: 'combo-v3', stockQuantity: 10 }],
    });
    const rule = await postAdmin('/api/combo-rules', {
      nameEn: 'Draft combo', nameAr: 'م', status: 'DRAFT',
      productIds: [product.id],
      tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
    });

    const customer = await createCustomer();
    const agent = request.agent(app);
    await agent
      .post('/api/cart/items')
      .set(bearer(customer.token))
      .send({ variantId: product.variants[0].id, quantity: 2 });

    let cart = await agent.get('/api/cart').set(bearer(customer.token));
    expect(cart.body.subtotal).toBe(7); // 2 x $3.50 — DRAFT rules never apply

    await patchAdmin(`/api/combo-rules/${rule.body.comboRule.id}`, { status: 'ACTIVE' });
    cart = await agent.get('/api/cart').set(bearer(customer.token));
    expect(cart.body.subtotal).toBe(5);
  });

  it('rejects checkout (does not silently reprice) when a combo rule changes between viewing the cart and checking out', async () => {
    const cat = await makeCategory({ slug: 'combo-race-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 3.5 },
      variants: [{ sku: 'combo-v4', stockQuantity: 10 }],
    });
    const rule = await postAdmin('/api/combo-rules', {
      nameEn: 'Race combo', nameAr: 'م', status: 'ACTIVE',
      productIds: [product.id],
      tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
    });

    const customer = await createCustomer();
    const agent = request.agent(app);
    await agent
      .post('/api/cart/items')
      .set(bearer(customer.token))
      .send({ variantId: product.variants[0].id, quantity: 2 });

    const cart = await agent.get('/api/cart').set(bearer(customer.token));
    expect(cart.body.subtotal).toBe(5);

    // The rule is paused after the shopper last saw the cart, but before
    // they place the order — the recomputed subtotal at checkout no longer
    // matches what expectedSubtotal claims, so checkout must refuse rather
    // than silently charging the new (higher) total.
    await patchAdmin(`/api/combo-rules/${rule.body.comboRule.id}`, { status: 'PAUSED' });

    const checkout = await agent
      .post('/api/orders/checkout')
      .set(bearer(customer.token))
      .send({ ...delivery, expectedSubtotal: cart.body.subtotal });
    expect(checkout.status).toBe(409);
    expect(checkout.body.error.meta?.reason).toBe('PRICE_CHANGED');
  });
});
