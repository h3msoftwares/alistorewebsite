// Staged load sweep in a single process (one warm connection pool to the API).
// Records a per-stage Recorder + stage wall-clock boundaries so a separately
// running monitor.mjs CSV can be joined afterwards (analyze.mjs).
//
//   node loadtest/sweep.mjs --mode vus --scenario mixed --steps 1,5,10,20,30,50,100 --seconds 60
//   node loadtest/sweep.mjs --mode rps --scenario mixed --steps 5,10,20,30,50,100   --seconds 60
//
// --base <url>  --settle <s> (idle gap between stages, default 8)  --out <file>

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Recorder } from './lib/stats.mjs';
import { closedLoop, openLoop, sleep } from './lib/runner.mjs';
import { bootstrap, SCENARIOS } from './scenarios/index.mjs';
import { Client } from './lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const cfg = {
  mode: arg('mode', 'vus'),
  scenario: arg('scenario', 'mixed'),
  steps: String(arg('steps', '1,5,10,20,30,50,100')).split(',').map(Number),
  seconds: Number(arg('seconds', 60)),
  settle: Number(arg('settle', 8)),
  base: arg('base', process.env.BASE_URL || 'http://localhost:4000'),
  out: arg('out', `loadtest/results/sweep-${arg('mode', 'vus')}-${arg('scenario', 'mixed')}.json`),
};

const main = async () => {
  const fn = SCENARIOS[cfg.scenario];
  if (!fn) throw new Error(`unknown scenario ${cfg.scenario}`);
  const c = new Client(cfg.base);
  for (let i = 0; i < 30; i++) { if ((await c.get('/health')).ok) break; await sleep(1000); }
  const ctx = await bootstrap(cfg.base, { customerCount: 200 });
  console.log(`[sweep] ${cfg.mode} ${cfg.scenario} steps=${cfg.steps} ${cfg.seconds}s/step @ ${cfg.base}`);
  console.log(`[sweep] ctx ${ctx.productIds.length}p ${ctx.variantIds.length}v ${ctx.checkoutVariantIds.length}cv`);

  // warmup
  { const r0 = new Recorder(); r0.start(); await closedLoop({ baseUrl: cfg.base, vus: 4, holdSec: 8, iter: fn, rec: r0, makeCtx: () => ctx }); r0.stop(); }

  const rows = [];
  for (const step of cfg.steps) {
    await sleep(cfg.settle * 1000);
    const rec = new Recorder();
    const startedAt = new Date().toISOString();
    rec.start();
    if (cfg.mode === 'rps') {
      const res = await openLoop({ baseUrl: cfg.base, rps: step, seconds: cfg.seconds, iter: fn, rec, makeCtx: () => ctx });
      rec.stop();
      rows.push({ step, kind: 'rps', startedAt, endedAt: new Date().toISOString(), launched: res.launched, ...rec.toJSON({ step }) });
    } else {
      await closedLoop({ baseUrl: cfg.base, vus: step, rampSec: Math.min(10, cfg.seconds / 4), holdSec: cfg.seconds, iter: fn, rec, makeCtx: () => ctx });
      rec.stop();
      rows.push({ step, kind: 'vus', startedAt, endedAt: new Date().toISOString(), ...rec.toJSON({ step }) });
    }
    const o = rows[rows.length - 1].overall;
    console.log(`[sweep] ${cfg.mode}=${String(step).padStart(4)}  rps ${String(o.rps).padStart(7)}  p50 ${String(o.p50).padStart(6)}  p95 ${String(o.p95).padStart(7)}  p99 ${String(o.p99).padStart(7)}  max ${String(o.max).padStart(7)}  err ${o.errPct}%  to ${o.timeoutPct}%`);
  }

  mkdirSync(dirname(cfg.out), { recursive: true });
  writeFileSync(cfg.out, JSON.stringify({ cfg, rows, at: new Date().toISOString() }, null, 2));
  console.log(`[sweep] wrote ${cfg.out}`);
};
main().catch((e) => { console.error(e); process.exit(1); });
