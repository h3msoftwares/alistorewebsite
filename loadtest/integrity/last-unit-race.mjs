// Real-HTTP last-unit race against the running stack (complements the
// vitest suite: this one goes through the real connection pool + Nginx/PaaS-
// style hop and whatever NODE_ENV the API booted with).
//
//   node loadtest/integrity/last-unit-race.mjs --base http://127.0.0.1:4000 \
//     --pg "postgresql://alistore:alistore@127.0.0.1:5544/alistore" --buyers 12 --stock 1
//
// Setup + verification go straight to Postgres via psql; the race goes through
// the API. Exits non-zero on any integrity violation.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Client } from '../lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const base = arg('base', 'http://127.0.0.1:4000');
const pg = arg('pg', 'postgresql://alistore:alistore@127.0.0.1:5544/alistore');
const buyers = Number(arg('buyers', 12));
const stock = Number(arg('stock', 1));
const PSQL = process.platform === 'win32' ? '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"' : 'psql';

function sql(text) {
  const f = resolve(tmpdir(), `integ-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(f, text);
  const raw = execSync(`${PSQL} "${pg}" -tA --no-align --field-separator="|" -f "${f}"`, { encoding: 'utf8' });
  // drop psql command tags ("INSERT 0 1", "UPDATE 3", …) and blank lines
  return raw.split(/\r?\n/).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT|BEGIN|COMMIT) /.test(l)).join('\n').trim();
}

const CUST_PW = 'LoadTest!234';

const main = async () => {
  const tag = `RACE-${Date.now()}`;
  // --- setup: a fresh product + one variant with `stock` units --------------
  const [catId, colId] = sql(`SELECT id, "collectionID" FROM category WHERE "collectionID" IS NOT NULL LIMIT 1;`).split('|');
  const prodId = sql(`
    INSERT INTO product (id,sku,"nameEn","nameAr","categoryID","collectionID",price,quantity,"isActive","dateCreated","lastEdit")
    VALUES (gen_random_uuid(), '${tag}', 'Race Item', 'سباق', '${catId}', ${colId ? `'${colId}'` : 'NULL'}, 20, ${stock}, true, now(), now())
    RETURNING id;`);
  const varId = sql(`
    INSERT INTO productvariant (id,"productID",sku,size,color,"stockQuantity")
    VALUES (gen_random_uuid(), '${prodId}', '${tag}-V', 'M', 'Black', ${stock})
    RETURNING id;`);
  console.log(`[race] product ${prodId} variant ${varId} stock=${stock} buyers=${buyers}`);

  // --- each buyer: login + add the variant to cart -------------------------
  const clients = [];
  for (let i = 1; i <= buyers; i++) {
    const c = new Client(base);
    await c.primeCsrf();
    const li = await c.post('/api/auth/login', { json: { identifier: `loadcust+${i}@loadtest.local`, password: CUST_PW } });
    if (!li.json?.accessToken) throw new Error(`buyer ${i} login failed: ${li.status}`);
    c.token = li.json.accessToken;
    const add = await c.post('/api/cart/items', { json: { variantId: varId, quantity: 1 } });
    if (!add.ok) throw new Error(`buyer ${i} cart add failed: ${add.status} ${JSON.stringify(add.json)}`);
    clients.push(c);
  }

  // --- the race: all check out at once ------------------------------------
  const delivery = { deliveryName: 'Race', deliveryPhone: '0790000000', deliveryAddress: '1 Race', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT' };
  const results = await Promise.all(clients.map((c) => c.post('/api/orders/checkout', { json: delivery, tag: 'checkout' })));
  const created = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status !== 201);
  const raw500 = results.filter((r) => r.status === 500);
  const busy503 = results.filter((r) => r.status === 503);
  const server5xx = results.filter((r) => r.status >= 500);

  // --- verify against the DB -------------------------------------------
  const finalStock = Number(sql(`SELECT "stockQuantity" FROM productvariant WHERE id='${varId}';`));
  const orderLines = Number(sql(`SELECT count(*) FROM orderitem WHERE "variantID"='${varId}';`));
  const saleSum = Number(sql(`SELECT COALESCE(sum(quantity),0) FROM stockmovement WHERE "variantID"='${varId}' AND type='SALE';`));

  // INTEGRITY invariants — must ALWAYS hold (an oversell / negative stock /
  // orphan order here is a ship-blocker).
  const integrity = [
    ['stock never negative', finalStock >= 0, `${finalStock}`],
    ['never oversold (orders <= stock)', created.length <= stock, `${created.length} <= ${stock}`],
    ['stock decremented exactly per success', finalStock === stock - created.length, `${finalStock} == ${stock} - ${created.length}`],
    ['order lines == successes', orderLines === created.length, `${orderLines} == ${created.length}`],
    ['SALE movements sum == -(successes)', saleSum === -created.length, `${saleSum} == -${created.length}`],
    ['no order without a committed decrement', created.length === orderLines, `${created.length}`],
  ];
  // AVAILABILITY expectations — SHOULD hold; a miss is graceful-degradation
  // debt, not corruption.
  const availability = [
    ['all `stock` units sold', created.length === stock, `${created.length} vs ${stock}`],
    ['losers got a clean 409 (not 5xx)', rejected.every((r) => r.status === 409), JSON.stringify(results.map((r) => r.status))],
    ['no raw 500 (503 retry is acceptable)', raw500.length === 0, `500s=${raw500.length} 503s=${busy503.length}`],
  ];

  let ok = true;
  console.log('  -- integrity --');
  for (const [name, pass, detail] of integrity) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}   (${detail})`); if (!pass) ok = false; }
  console.log('  -- availability --');
  for (const [name, pass, detail] of availability) console.log(`  ${pass ? 'PASS' : 'WARN'}  ${name}   (${detail})`);

  // --- cleanup: archive (a hard delete is blocked by the orderitem FK once
  // the race has created an order) --------------------------------------
  sql(`UPDATE product SET "isActive"=false, "deletedAt"=now() WHERE sku='${tag}';`);
  console.log(`[race] integrity: ${ok ? 'INTACT' : 'VIOLATION'}   created=${created.length}/${stock}  409=${rejected.filter((r) => r.status === 409).length}  503=${busy503.length}  500=${raw500.length}`);
  process.exit(ok ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
