// Hard-crash drill: steady load, SIGKILL the API, measure downtime, restart it,
// verify recovery AND data consistency (a crash mid-checkout must not leave a
// partial order / phantom stock movement).
//
//   node loadtest/failure/crash-restart.mjs --base http://127.0.0.1:4000 --apipid <pid> \
//     --pg "postgresql://alistore:alistore@127.0.0.1:5544/alistore" --db "<same as start-api --db>"
//
// Restarts the API itself via start-api.mjs (simulating a process manager).

import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Recorder } from '../lib/stats.mjs';
import { openLoop, sleep } from '../lib/runner.mjs';
import { bootstrap, hit } from '../scenarios/index.mjs';
import { Client } from '../lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const cfg = {
  base: arg('base', 'http://127.0.0.1:4000'),
  apipid: Number(arg('apipid', 0)) || Number(readFileSync('loadtest/results/api.pid', 'utf8').trim()),
  db: arg('db', 'postgresql://alistore:alistore@127.0.0.1:5544/alistore?schema=public'),
  pg: arg('pg', 'postgresql://alistore:alistore@127.0.0.1:5544/alistore'),
  rps: Number(arg('rps', 8)),
  total: Number(arg('total', 60)),
  killAt: Number(arg('killAt', 15)),
  restartAt: Number(arg('restartAt', 22)),
  out: arg('out', 'loadtest/results/failure-crash-restart.json'),
};
const PSQL = process.platform === 'win32' ? '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"' : 'psql';
function sql(text) {
  const f = resolve(tmpdir(), `crash-${Date.now()}.sql`); writeFileSync(f, text);
  return execFileSync(process.platform === 'win32' ? 'cmd' : 'sh', process.platform === 'win32' ? ['/c', `${PSQL} "${cfg.pg}" -tA --no-align -f "${f}"`] : ['-c', `${PSQL} "${cfg.pg}" -tA --no-align -f "${f}"`], { encoding: 'utf8' }).trim();
}

const main = async () => {
  const consistencyBefore = sql(`
    SELECT
      (SELECT count(*) FROM "order") ,
      (SELECT count(*) FROM "order" o WHERE NOT EXISTS (SELECT 1 FROM orderitem i WHERE i."orderID"=o.id)) ,
      (SELECT count(*) FROM productvariant WHERE "stockQuantity" < 0) ,
      (SELECT count(*) FROM stockmovement sm WHERE sm."orderID" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "order" o WHERE o.id=sm."orderID"));
  `);
  console.log(`[crash] consistency before (orders, orders-with-no-items, negative-stock, orphan-movements): ${consistencyBefore}`);

  const c = new Client(cfg.base);
  if (!(await c.get('/health')).ok) throw new Error('API not healthy');
  const ctx = await bootstrap(cfg.base, { customerCount: 50 });

  const rec = new Recorder(); rec.start();
  const t0 = Date.now();
  let killedAt = null, healthyAgainAt = null;

  setTimeout(() => {
    try { execFileSync('taskkill', ['/F', '/PID', String(cfg.apipid)], { stdio: 'pipe' }); } catch {}
    killedAt = (Date.now() - t0) / 1000;
    console.log(`[crash] +${killedAt.toFixed(1)}s  SIGKILL api pid ${cfg.apipid}`);
  }, cfg.killAt * 1000);

  setTimeout(() => {
    const child = spawn(process.execPath, ['loadtest/start-api.mjs', '--db', cfg.db, '--affinity', '1'], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log(`[crash] +${cfg.restartAt}s  restart issued`);
  }, cfg.restartAt * 1000);

  const hp = setInterval(async () => {
    if (killedAt && !healthyAgainAt) {
      if ((await new Client(cfg.base).get('/health')).ok) { healthyAgainAt = (Date.now() - t0) / 1000; console.log(`[crash] +${healthyAgainAt.toFixed(1)}s  /health OK again`); }
    }
  }, 500);

  await openLoop({ baseUrl: cfg.base, rps: cfg.rps, seconds: cfg.total, iter: hit, rec, makeCtx: () => ctx });
  rec.stop(); clearInterval(hp);
  await sleep(2000);

  const consistencyAfter = sql(`
    SELECT
      (SELECT count(*) FROM "order") ,
      (SELECT count(*) FROM "order" o WHERE NOT EXISTS (SELECT 1 FROM orderitem i WHERE i."orderID"=o.id)) ,
      (SELECT count(*) FROM productvariant WHERE "stockQuantity" < 0) ,
      (SELECT count(*) FROM stockmovement sm WHERE sm."orderID" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "order" o WHERE o.id=sm."orderID"));
  `);
  console.log(`[crash] consistency after : ${consistencyAfter}`);

  const [ob, opb, nsb, omb] = consistencyBefore.split('|').map(Number);
  const [oa, opa, nsa, om0] = consistencyAfter.split('|').map(Number);
  const summary = {
    cfg, killedAt, healthyAgainAt,
    downtimeSec: killedAt != null && healthyAgainAt != null ? +(healthyAgainAt - killedAt).toFixed(1) : null,
    consistency: {
      ordersBefore: ob, ordersAfter: oa,
      ordersWithNoItems: opa, negativeStock: nsa, orphanMovements: om0,
      clean: opa === 0 && nsa === 0 && om0 === 0,
    },
    windows: rec.windows(5),
    overall: rec.overall(),
  };
  mkdirSync('loadtest/results', { recursive: true });
  writeFileSync(cfg.out, JSON.stringify(summary, null, 2));
  console.log(`[crash] downtime ~${summary.downtimeSec}s   data clean after crash: ${summary.consistency.clean}`);
  console.log(`[crash] wrote ${cfg.out}`);
  process.exit(summary.consistency.clean && healthyAgainAt != null ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
