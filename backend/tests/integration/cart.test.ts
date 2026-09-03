import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let variantId: string;
let lowStockVariantId: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 15 },
    variants: [
      { sku: 'v-main', size: 'M', color: 'Black', stockQuantity: 20 },
      { sku: 'v-low', size: 'S', color: 'Black', stockQuantity: 1 },
    ],
  });
  variantId = p.variants[0].id;
  lowStockVariantId = p.variants[1].id;
});

describe('Cart API', () => {
  it('guest: add item creates a cookie-scoped cart, get returns subtotal', async () => {
    const agent = request.agent(app);

    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    expect(add.status).toBe(201);

    const get = await agent.get('/api/cart');
    expect(get.status).toBe(200);
    expect(get.body.items).toHaveLength(1);
    expect(get.body.subtotal).toBe(30);

    // a fresh agent (no cookie) sees an empty cart
    const other = await request(app).get('/api/cart');
    expect(other.body.items).toHaveLength(0);
  });

  it('adding the same variant twice merges quantity', async () => {
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    await agent.post('/api/cart/items').send({ variantId, quantity: 3 });
    const get = await agent.get('/api/cart');
    expect(get.body.items).toHaveLength(1);
    expect(get.body.items[0].quantity).toBe(4);
  });

  it('rejects adding more than available stock', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('404s an unknown variant', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .send({ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 });
    expect(res.status).toBe(404);
  });

  it('updates quantity, removes an item, and clears the cart', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const itemId = add.body.item.id;

    const upd = await agent.patch(`/api/cart/items/${itemId}`).send({ quantity: 5 });
    expect(upd.status).toBe(200);
    expect(upd.body.item.quantity).toBe(5);

    const del = await agent.delete(`/api/cart/items/${itemId}`);
    expect(del.status).toBe(204);
    expect((await agent.get('/api/cart')).body.items).toHaveLength(0);

    await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    const clear = await agent.delete('/api/cart');
    expect(clear.status).toBe(204);
    expect((await agent.get('/api/cart')).body.items).toHaveLength(0);
  });

  it("cannot touch another owner's cart item (404)", async () => {
    const a = request.agent(app);
    const add = await a.post('/api/cart/items').send({ variantId, quantity: 1 });
    const b = request.agent(app);
    const res = await b.patch(`/api/cart/items/${add.body.item.id}`).send({ quantity: 2 });
    expect(res.status).toBe(404);
  });

  it('a logged-in user has their own persistent cart', async () => {
    const { token } = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 2 });
    const get = await request(app).get('/api/cart').set(bearer(token));
    expect(get.body.items).toHaveLength(1);

    const carts = await prisma.cart.findMany();
    expect(carts).toHaveLength(1);
    expect(carts[0].userID).not.toBeNull();
  });
});
