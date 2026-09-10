// DB-outage drill: light steady load, stop Postgres mid-run, restart it, watch
// how the API behaves. Expected: fast 5xx (not hangs), process stays up, auto-
// recovers when the DB returns. Records per-5s-window error/timeout/latency.
//
//   node loadtest/failure/db-outage.mjs --base http://127.0.0.1:4000 \
//     --pgctl "C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe" --pgdata "<scratch>/pgdata" \
//     --rps 8 --total 120 --down-at 25 --up-at 55

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { Recorder } from '../lib/stats.mjs';
import { openLoop, sleep } from '../lib/runner.mjs';
import { bootstrap, hit } from '../scenarios/index.mjs';
import { Client } from '../lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const cfg = {
  base: arg('base', 'http://127.0.0.1:4000'),
  pgctl: arg('pgctl', 'pg_ctl'),
  pgdata: arg('pgdata', process.env.PGDATA || ''),
  apipid: Number(arg('apipid', 0)) || Number(readFileSync('loadtest/results/api.pid', 'utf8').trim()),
  rps: Number(arg('rps', 8)),
  total: Number(arg('total', 120)),
  downAt: Number(arg('down-at', 25)),
  upAt: Number(arg('up-at', 55)),
  out: arg('out', 'loadtest/results/failure-db-outage.json'),
};

const pg = (action, extra = []) => {
  try { execFileSync(cfg.pgctl, ['-D', cfg.pgdata, ...(action === 'stop' ? ['-m', 'fast'] : []), '-w', '-t', '20', action, ...extra], { stdio: 'pipe' }); return true; }
  catch (e) { console.error(`[db-outage] pg_ctl ${action}:`, e.stdout?.toString() || e.message); return false; }
};
const apiAlive = () => { try { execFileSync('powershell', ['-NoProfile', '-Command', `Get-Process -Id ${cfg.apipid} -ErrorAction Stop | Out-Null`], { stdio: 'pipe' }); return true; } catch { return false; } };

const main = async () => {
  const c = new Client(cfg.base);
  for (let i = 0; i < 20; i++) { if ((await c.get('/health')).ok) break; await sleep(1000); }
  const ctx = await bootstrap(cfg.base, { customerCount: 50 });
  console.log(`[db-outage] ${cfg.rps} rps for ${cfg.total}s; DB down @${cfg.downAt}s, up @${cfg.upAt}s; api pid ${cfg.apipid}`);

  const rec = new Recorder(); rec.start();
  const events = [];
  const schedule = [
    [cfg.downAt, () => { const ok = pg('stop'); events.push({ at: cfg.downAt, ev: 'pg stop', ok }); console.log(`[db-outage] +${cfg.downAt}s  Postgres STOP -> ${ok}`); }],
    [cfg.upAt, () => { const ok = pg('start', ['-l', 'loadtest/results/pg-restart.log']); events.push({ at: cfg.upAt, ev: 'pg start', ok }); console.log(`[db-outage] +${cfg.upAt}s  Postgres START -> ${ok}`); }],
  ];
  const t0 = Date.now();
  const timers = schedule.map(([at, fn]) => setTimeout(fn, at * 1000));
  const aliveChecks = [];
  const aliveTimer = setInterval(() => aliveChecks.push({ t: ((Date.now() - t0) / 1000).toFixed(0), alive: apiAlive() }), 5000);

  await openLoop({ baseUrl: cfg.base, rps: cfg.rps, seconds: cfg.total, iter: hit, rec, makeCtx: () => ctx });
  rec.stop();
  timers.forEach(clearTimeout); clearInterval(aliveTimer);

  // ensure DB is back up for subsequent tests
  if (!apiHealthyNow()) { /* noop */ }
  async function apiHealthyNow() { return (await new Client(cfg.base).get('/health')).ok; }
  const healthyAfter = await (async () => { for (let i = 0; i < 30; i++) { if ((await new Client(cfg.base).get('/health')).ok) return true; await sleep(1000); } return false; })();

  const wins = rec.windows(5);
  // recovery = first window AFTER up-at with errPct back < 2%
  let recoveredAtSec = null;
  for (const w of wins) if (w.fromSec >= cfg.upAt && w.errPct < 2) { recoveredAtSec = w.fromSec; break; }

  const summary = {
    cfg, events,
    apiStayedUp: aliveChecks.every((a) => a.alive),
    aliveChecks,
    healthyAfter,
    recoveredAtSec,
    outageWindows: wins.filter((w) => w.fromSec >= cfg.downAt - 5 && w.fromSec <= cfg.upAt + 20),
    overall: rec.overall(),
  };
  mkdirSync('loadtest/results', { recursive: true });
  writeFileSync(cfg.out, JSON.stringify(summary, null, 2));
  console.log('[db-outage] windows (err%/to%/p95 around the outage):');
  for (const w of summary.outageWindows) console.log(`  +${String(w.fromSec).padStart(3)}s  n ${String(w.count).padStart(3)}  err ${String(w.errPct).padStart(6)}%  to ${String(w.timeoutPct).padStart(6)}%  p95 ${w.p95}  p99 ${w.p99}`);
  console.log(`[db-outage] api stayed up: ${summary.apiStayedUp}   healthy after: ${healthyAfter}   error back <2% by +${recoveredAtSec}s`);
  console.log(`[db-outage] wrote ${cfg.out}`);
  process.exit(summary.apiStayedUp && healthyAfter ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
