// Realistic per-VU scenarios. Each takes (client, ctx) and returns an array of
// request-result objects (from Client.req). Think-time lives inside.
//
// ctx is produced once by bootstrap() below and shared (read-only) across VUs:
//   { baseUrl, productIds[], variantIds[], checkoutVariantIds[], customers[], regions[] }

import { Client, think } from '../lib/http.mjs';

const SEARCH_TERMS = ['shirt', 'dress', 'jean', 't-shirt', 'hoodie', 'kids', 'jacket', 'skirt', 'sweater', 'shorts', 'blouse', 'navy'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Round-robin customer picker so concurrent checkout/auth iterations use
// DISTINCT accounts — one shopper's own concurrent checkouts are serialized by
// the advisory lock (correct, but it turns into throughput noise here). The
// last-unit / double-submit races are exercised deliberately in loadtest/integrity/.
let _custCursor = 0;
const nextCustomer = (ctx) => ctx.customers[(_custCursor++) % ctx.customers.length];

/** Discover the data the scenarios need, from the live API. */
export async function bootstrap(baseUrl, { customerCount = 200 } = {}) {
  const c = new Client(baseUrl);
  const r = await c.get('/api/products?page=1&pageSize=60');
  if (!r.ok) throw new Error(`bootstrap: GET /api/products -> ${r.status} ${r.error || ''}`);
  const items = r.json?.items || [];
  const productIds = items.map((p) => p.id);
  const variantIds = [];
  const checkoutVariantIds = [];
  for (const p of items) {
    for (const v of p.variants || []) {
      if (p.sku === 'LOADTEST-CHECKOUT') checkoutVariantIds.push(v.id);
      else if ((v.stockQuantity ?? 0) > 2) variantIds.push(v.id);
    }
  }
  // checkout product isn't on page 1 by default — fetch it directly
  if (checkoutVariantIds.length === 0) {
    const s = await c.get('/api/products?search=Load%20Test%20Checkout&pageSize=5');
    for (const p of s.json?.items || []) {
      if (p.sku === 'LOADTEST-CHECKOUT') for (const v of p.variants || []) checkoutVariantIds.push(v.id);
    }
  }
  const customers = Array.from({ length: customerCount }, (_, i) => ({
    email: `loadcust+${i + 1}@loadtest.local`, password: 'LoadTest!234',
  }));
  return {
    baseUrl,
    productIds,
    variantIds,
    checkoutVariantIds,
    customers,
    regions: ['BEIRUT', 'MOUNT_LEBANON', 'NORTH', 'SOUTH', 'BEKAA'],
  };
}

// ---- scenarios --------------------------------------------------------------

export async function browse(client, ctx) {
  const out = [];
  out.push(await client.get('/api/settings', { tag: 'GET /api/settings' }));
  out.push(await client.get('/api/collections', { tag: 'GET /api/collections' }));
  out.push(await client.get('/api/categories', { tag: 'GET /api/categories' }));
  await think(0.3, 1.2);
  const list = await client.get('/api/products?page=1&pageSize=24', { tag: 'GET /api/products' });
  out.push(list);
  const id = pick(list.json?.items || ctx.productIds || []);
  const pid = typeof id === 'string' ? id : id?.id;
  if (pid) {
    await think(0.5, 2);
    out.push(await client.get(`/api/products/${pid}`, { tag: 'GET /api/products/:id' }));
  }
  out.push(await client.get('/api/products?onSale=true&page=1&pageSize=24', { tag: 'GET /api/products?onSale' }));
  await think(0.5, 2.5);
  return out;
}

export async function search(client) {
  const term = encodeURIComponent(pick(SEARCH_TERMS));
  const out = [
    await client.get(`/api/products?search=${term}&page=1&pageSize=24`, { tag: 'GET /api/products?search' }),
  ];
  await think(0.5, 2);
  return out;
}

// ONE request per iteration — for the req/s (arrival-rate) sweep, so "N rps"
// target == N HTTP requests/sec. Endpoint weights ≈ a storefront page's fan-out.
const HIT_MIX = [
  [(c) => c.get('/api/products?page=1&pageSize=24', { tag: 'GET /api/products' }), 0.34],
  [(c, x) => c.get(`/api/products/${pick(x.productIds)}`, { tag: 'GET /api/products/:id' }), 0.24],
  [(c) => c.get('/api/settings', { tag: 'GET /api/settings' }), 0.12],
  [(c) => c.get('/api/categories', { tag: 'GET /api/categories' }), 0.10],
  [(c) => c.get('/api/collections', { tag: 'GET /api/collections' }), 0.08],
  [(c) => c.get(`/api/products?search=${encodeURIComponent(pick(SEARCH_TERMS))}&page=1&pageSize=24`, { tag: 'GET /api/products?search' }), 0.08],
  [(c) => c.get('/api/products?onSale=true&page=1&pageSize=24', { tag: 'GET /api/products?onSale' }), 0.04],
];
export async function hit(client, ctx) {
  const r = Math.random();
  let acc = 0;
  for (const [fn, w] of HIT_MIX) { acc += w; if (r <= acc) return [await fn(client, ctx)]; }
  return [await HIT_MIX[0][0](client, ctx)];
}

export async function auth(client, ctx) {
  const cust = nextCustomer(ctx);
  const fresh = new Client(ctx.baseUrl); // isolated session per iteration
  await fresh.primeCsrf(); // setup — not part of the measured journey
  const out = [];
  const li = await fresh.post('/api/auth/login', { json: { identifier: cust.email, password: cust.password }, tag: 'POST /api/auth/login' });
  out.push(li);
  if (li.json?.accessToken) fresh.token = li.json.accessToken;
  else { await think(0.5, 1); return out; }
  await think(0.3, 1);
  out.push(await fresh.get('/api/users/me', { tag: 'GET /api/users/me' }));
  await think(0.5, 1.5);
  out.push(await fresh.post('/api/auth/refresh', { tag: 'POST /api/auth/refresh', csrf: false }));
  out.push(await fresh.post('/api/auth/logout', { tag: 'POST /api/auth/logout' }));
  return out;
}

export async function shop(client, ctx) {
  const out = [];
  // guest cart — the client keeps its guest-cart cookie across the flow
  if (!client.csrf) await client.primeCsrf();
  const vId = pick(ctx.variantIds);
  if (!vId) { await think(0.5, 1); return out; }
  const add = await client.post('/api/cart/items', { json: { variantId: vId, quantity: 1 }, tag: 'POST /api/cart/items' });
  out.push(add);
  await think(0.5, 1.5);
  out.push(await client.get('/api/cart', { tag: 'GET /api/cart' }));
  // find the line id to bump quantity
  const g = out[out.length - 1];
  const line = (g.json?.items || [])[0];
  if (line?.id) {
    out.push(await client.patch(`/api/cart/items/${line.id}`, { json: { quantity: 2 }, tag: 'PATCH /api/cart/items/:id' }));
  }
  await think(0.5, 2);
  return out;
}

/**
 * Verified logged-in customer places a COD order for the infinite-stock
 * checkout variant. Skips the email-OTP path (account is emailVerified).
 */
export async function checkout(client, ctx) {
  const out = [];
  await client.primeCsrf();
  const cust = nextCustomer(ctx);
  const li = await client.post('/api/auth/login', { json: { identifier: cust.email, password: cust.password }, tag: 'POST /api/auth/login (checkout)' });
  out.push(li);
  if (!li.json?.accessToken) { await think(0.5, 1); return out; }
  client.token = li.json.accessToken;

  const vId = pick(ctx.checkoutVariantIds);
  if (!vId) { await think(0.5, 1); return out; }

  out.push(await client.post('/api/cart/items', { json: { variantId: vId, quantity: 1 }, tag: 'POST /api/cart/items (checkout)' }));
  await think(0.5, 1.5);
  out.push(await client.get('/api/cart', { tag: 'GET /api/cart (checkout)' }));
  const region = pick(ctx.regions);
  out.push(await client.get(`/api/orders/delivery-quote?region=${region}`, { tag: 'GET /api/orders/delivery-quote' }));
  await think(0.8, 2.5);
  out.push(await client.post('/api/orders/checkout', {
    tag: 'POST /api/orders/checkout',
    json: {
      deliveryName: cust.email.split('@')[0],
      deliveryPhone: '+9613000000',
      deliveryAddress: '1 Load Test Ave',
      deliveryCity: 'Beirut',
      deliveryRegion: region,
      saveAddress: false,
    },
  }));
  await client.post('/api/auth/logout', { tag: 'POST /api/auth/logout (checkout)' });
  return out;
}

// weighted blend = the "realistic traffic" run
const MIX = [
  [browse, 0.62],
  [search, 0.16],
  [shop, 0.12],
  [auth, 0.06],
  [checkout, 0.04],
];
export async function mixed(client, ctx) {
  const r = Math.random();
  let acc = 0;
  for (const [fn, w] of MIX) { acc += w; if (r <= acc) return fn(client, ctx); }
  return browse(client, ctx);
}

export const SCENARIOS = { browse, search, auth, shop, checkout, mixed, hit };
