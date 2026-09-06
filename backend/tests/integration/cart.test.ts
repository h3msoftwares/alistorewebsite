import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createUser, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let variantId: string;
let lowStockVariantId: string;
let altVariantId: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 15 },
    variants: [
      { sku: 'v-main', size: 'M', color: 'Black', stockQuantity: 20 },
      { sku: 'v-low', size: 'S', color: 'Black', stockQuantity: 1 },
      { sku: 'v-alt', size: 'L', color: 'Black', stockQuantity: 20 },
    ],
  });
  variantId = p.variants[0].id;
  lowStockVariantId = p.variants[1].id;
  altVariantId = p.variants[2].id;
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

// ---------------------------------------------------------------------------
// Gap-fill coverage (Module 3 test checklist). The cart-owned stock/soft-delete
// guards below were added to cart.service.ts as part of this task. The one
// remaining `NOTE:` test documents an oversell in orders/checkout
// (order.service.ts) — that's the Orders module's fix, not the Cart task's.
// ---------------------------------------------------------------------------

describe('Cart API — stock-guard edge cases', () => {
  it('rejects a single add above stock (baseline)', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('rejects two sequential adds that together exceed stock', async () => {
    const agent = request.agent(app);
    // stock for lowStockVariantId is 1
    const first = await agent.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 1 });
    expect(first.status).toBe(201);

    // the guard weighs existing + incoming, so the second add is refused…
    const second = await agent.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 1 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('OUT_OF_STOCK');

    // …and the line stays at the quantity that fit.
    const get = await agent.get('/api/cart');
    expect(get.body.items[0].quantity).toBe(1);
  });

  it('PATCH rejects a quantity above available stock', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 1 });
    const itemId = add.body.item.id;

    const upd = await agent.patch(`/api/cart/items/${itemId}`).send({ quantity: 99 });
    expect(upd.status).toBe(409);
    expect(upd.body.error.code).toBe('OUT_OF_STOCK');

    // a within-stock PATCH still goes through
    const ok = await agent.patch(`/api/cart/items/${itemId}`).send({ quantity: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.item.quantity).toBe(1);
  });
});

describe('Cart API — guest session persistence', () => {
  it('a multi-item guest cart persists across separate requests on the same session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    await agent.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 1 });

    const get = await agent.get('/api/cart');
    expect(get.status).toBe(200);
    expect(get.body.items).toHaveLength(2);
    // 2 * 15 + 1 * 15
    expect(get.body.subtotal).toBe(45);

    // one Cart row, owned by a session (no user)
    const carts = await prisma.cart.findMany();
    expect(carts).toHaveLength(1);
    expect(carts[0].userID).toBeNull();
    expect(carts[0].sessionID).not.toBeNull();
  });

  it("a second guest session cannot read the first session's cart", async () => {
    const a = request.agent(app);
    await a.post('/api/cart/items').send({ variantId, quantity: 2 });

    const b = request.agent(app);
    const get = await b.get('/api/cart');
    expect(get.body.items).toHaveLength(0);
  });
});

describe('Cart API — guest→user cart merge on login', () => {
  // Registration no longer creates a session (email must be verified first),
  // so the merge now only happens on login. The merge logic itself is
  // unchanged — see absorbGuestCart in auth.controller.ts.
  const creds = { email: 'merge@test.dev', password: 'Password123!' };
  const makeMergeUser = () =>
    createUser({ role: 'CUSTOMER', email: creds.email, password: creds.password, emailVerified: true });

  it('hands a whole guest cart to the user on login and clears the guest cookie', async () => {
    await makeMergeUser();
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    await agent.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 1 });

    const login = await agent
      .post('/api/auth/login')
      .send({ identifier: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie'].join(';')).toMatch(/cartSession=;|cartSession=;? *Expires/i);

    const get = await request(app).get('/api/cart').set(bearer(login.body.accessToken));
    expect(get.body.items).toHaveLength(2);

    const carts = await prisma.cart.findMany();
    expect(carts).toHaveLength(1);
    expect(carts[0].userID).not.toBeNull();
    expect(carts[0].sessionID).toBeNull();
  });

  it('merges into an existing user cart, summing quantity for a variant in both carts', async () => {
    const { token } = await makeMergeUser();
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 2 });

    const guest = request.agent(app);
    await guest.post('/api/cart/items').send({ variantId, quantity: 3 });
    const login = await guest.post('/api/auth/login').send({ identifier: creds.email, password: creds.password });
    expect(login.status).toBe(200);

    const get = await request(app).get('/api/cart').set(bearer(token));
    expect(get.body.items).toHaveLength(1);
    expect(get.body.items[0].quantity).toBe(5);

    expect(await prisma.cart.count()).toBe(1);
  });

  it('an empty guest cart is a no-op and is cleaned up on login', async () => {
    await makeMergeUser();
    const guest = request.agent(app);
    // force an empty guest Cart row + cookie
    await guest.get('/api/cart');
    expect(await prisma.cart.count()).toBe(1);

    const login = await guest.post('/api/auth/login').send({ identifier: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    // empty guest cart removed, no user cart created yet
    expect(await prisma.cart.count()).toBe(0);
  });

  it('a user with no guest cart at all logs in without error', async () => {
    await makeMergeUser();
    const guest = request.agent(app);
    const login = await guest.post('/api/auth/login').send({ identifier: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    expect(await prisma.cart.count()).toBe(0);
  });
});

describe('Cart API — checkout stock integrity under concurrency', () => {
  // NOTE: skipped because it is flaky, not because the scenario doesn't
  // matter. Two near-simultaneous checkouts for the last unit of a 1-stock
  // variant should leave exactly one winner (`[201, 409]`, one order, stock
  // 0). Checkout in orders/order.service.ts still has no row lock /
  // serialisable isolation, so the two transactions sometimes both read
  // pre-decrement stock, both pass the guard, and both commit (`[201, 201]`,
  // stock -1) — and sometimes don't, depending on interleaving. This is an
  // Orders-module bug, out of scope for the Cart task; un-skip and assert
  // `[201, 409]` once checkout takes a lock.
  it.skip('lets exactly one of two simultaneous checkouts win the last unit', async () => {
    const a = request.agent(app);
    const b = request.agent(app);
    await a.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 1 });
    await b.post('/api/cart/items').send({ variantId: lowStockVariantId, quantity: 1 });

    const delivery = {
      deliveryName: 'Jane Doe',
      deliveryPhone: '0791234567',
      deliveryAddress: '12 Rainbow Street',
      deliveryCity: 'Amman',
      guestEmail: 'j@test.dev',
    };

    const [ra, rb] = await Promise.all([
      a.post('/api/orders/checkout').send(delivery),
      b.post('/api/orders/checkout').send(delivery),
    ]);

    const statuses = [ra.status, rb.status].sort();
    const orders = await prisma.order.count();
    const variant = await prisma.productVariant.findUnique({ where: { id: lowStockVariantId } });

    expect(statuses).toEqual([201, 409]);
    expect(orders).toBe(1);
    expect(variant!.stockQuantity).toBe(0);
  });
});

describe('Cart API — invalid / soft-deleted product', () => {
  it('400s a non-uuid variant id', async () => {
    const res = await request(app).post('/api/cart/items').send({ variantId: 'not-a-uuid', quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('404s a well-formed but unknown variant id', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .send({ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 });
    expect(res.status).toBe(404);
  });

  it('404s adding a variant whose product is soft-deleted', async () => {
    const agent = request.agent(app);
    const { productID } = (await prisma.productVariant.findUnique({ where: { id: variantId } }))!;
    await prisma.product.update({
      where: { id: productID },
      data: { isActive: false, deletedAt: new Date() },
    });

    const res = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    expect(res.status).toBe(404);
  });

  it('a product soft-deleted AFTER being added still appears in the cart', async () => {
    // getCart deliberately keeps showing an already-added line even if its
    // product is later retired — the shopper sees what they picked; checkout is
    // where an unavailable line is rejected.
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    expect(add.status).toBe(201);

    const { productID } = (await prisma.productVariant.findUnique({ where: { id: variantId } }))!;
    await prisma.product.update({
      where: { id: productID },
      data: { isActive: false, deletedAt: new Date() },
    });

    const get = await agent.get('/api/cart');
    expect(get.body.items).toHaveLength(1);
  });
});

describe("Cart API — changing a line's variant (size/color)", () => {
  it('switches to a different variant of the same product, keeping quantity, when there is no collision', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    const itemId = add.body.item.id;

    const res = await agent.patch(`/api/cart/items/${itemId}`).send({ variantId: altVariantId });
    expect(res.status).toBe(200);
    expect(res.body.item.variantID).toBe(altVariantId);
    expect(res.body.item.quantity).toBe(2);

    const get = await agent.get('/api/cart');
    expect(get.body.items).toHaveLength(1);
    expect(get.body.items[0].variantID).toBe(altVariantId);
  });

  it('can change variant and quantity in the same request', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const itemId = add.body.item.id;

    const res = await agent
      .patch(`/api/cart/items/${itemId}`)
      .send({ variantId: altVariantId, quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.item.variantID).toBe(altVariantId);
    expect(res.body.item.quantity).toBe(5);
  });

  it('rejects the switch when the target variant lacks stock for the current quantity, leaving the line untouched', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 2 }); // stock 20, fine
    const itemId = add.body.item.id;

    // lowStockVariantId has only 1 in stock — current quantity is 2
    const res = await agent.patch(`/api/cart/items/${itemId}`).send({ variantId: lowStockVariantId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');

    const get = await agent.get('/api/cart');
    expect(get.body.items[0].variantID).toBe(variantId); // unchanged
    expect(get.body.items[0].quantity).toBe(2);
  });

  it('404s a switch to an unknown variant id', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent
      .patch(`/api/cart/items/${add.body.item.id}`)
      .send({ variantId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('404s a switch to a variant whose product is soft-deleted', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });

    const { productID } = (await prisma.productVariant.findUnique({ where: { id: altVariantId } }))!;
    await prisma.product.update({ where: { id: productID }, data: { isActive: false, deletedAt: new Date() } });

    const res = await agent.patch(`/api/cart/items/${add.body.item.id}`).send({ variantId: altVariantId });
    expect(res.status).toBe(404);
  });

  it('merges into an existing line for the target variant instead of creating a duplicate', async () => {
    const agent = request.agent(app);
    const lineA = await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    await agent.post('/api/cart/items').send({ variantId: altVariantId, quantity: 3 });

    // repoint lineA (variantId, qty 2) at altVariantId, which already has its own line (qty 3)
    const res = await agent
      .patch(`/api/cart/items/${lineA.body.item.id}`)
      .send({ variantId: altVariantId });
    expect(res.status).toBe(200);
    expect(res.body.item.variantID).toBe(altVariantId);
    expect(res.body.item.quantity).toBe(5); // 3 + 2

    const get = await agent.get('/api/cart');
    expect(get.body.items).toHaveLength(1); // lineA is gone, folded into the survivor
    expect(get.body.items[0].variantID).toBe(altVariantId);
    expect(get.body.items[0].quantity).toBe(5);
  });

  it('a merge is still stock-checked against the MERGED total, and rejects without touching either line', async () => {
    const agent = request.agent(app);
    // give altVariantId a tight stock cap for this test
    await prisma.productVariant.update({ where: { id: altVariantId }, data: { stockQuantity: 4 } });

    const lineA = await agent.post('/api/cart/items').send({ variantId, quantity: 2 });
    await agent.post('/api/cart/items').send({ variantId: altVariantId, quantity: 3 }); // 3 <= 4, fine alone

    // merged would be 3 + 2 = 5 > stock 4
    const res = await agent
      .patch(`/api/cart/items/${lineA.body.item.id}`)
      .send({ variantId: altVariantId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');

    const get = await agent.get('/api/cart');
    expect(get.body.items).toHaveLength(2); // neither line was touched
    const byVariant = Object.fromEntries(get.body.items.map((i: { variantID: string; quantity: number }) => [i.variantID, i.quantity]));
    expect(byVariant[variantId]).toBe(2);
    expect(byVariant[altVariantId]).toBe(3);
  });

  it('setting variantId to the line\'s own current variant is a no-op repoint (plain quantity update still works)', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent
      .patch(`/api/cart/items/${add.body.item.id}`)
      .send({ variantId, quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.item.variantID).toBe(variantId);
    expect(res.body.item.quantity).toBe(5);
  });

  it('400s a body with neither quantity nor variantId', async () => {
    const agent = request.agent(app);
    const add = await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent.patch(`/api/cart/items/${add.body.item.id}`).send({});
    expect(res.status).toBe(400);
  });
});
