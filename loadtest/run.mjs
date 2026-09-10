// Single load run. Closed-loop (VUs) or open-loop (arrival rate) over one scenario.
//
//   node loadtest/run.mjs --scenario mixed  --model closed --vus 20 --hold 120 --ramp 15
//   node loadtest/run.mjs --scenario browse --model open   --rps 30 --dur 120
//   node loadtest/run.mjs --scenario checkout --model closed --vus 10 --hold 60
//
// Flags: --base <url>  --out <file.json>  --warmup <s>  --customers <n>  --quiet

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Recorder } from './lib/stats.mjs';
import { closedLoop, openLoop } from './lib/runner.mjs';
import { bootstrap, SCENARIOS } from './scenarios/index.mjs';
import { Client, sleep } from './lib/http.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const cfg = {
  base: arg('base', process.env.BASE_URL || 'http://localhost:4010'),
  scenario: arg('scenario', 'mixed'),
  model: arg('model', 'closed'),
  vus: Number(arg('vus', 10)),
  rps: Number(arg('rps', 10)),
  hold: Number(arg('hold', 60)),
  ramp: Number(arg('ramp', 0)),
  dur: Number(arg('dur', 60)),
  warmup: Number(arg('warmup', 3)),
  customers: Number(arg('customers', 200)),
  out: arg('out', null),
  quiet: !!arg('quiet', false),
};

async function waitHealthy(base, tries = 30) {
  const c = new Client(base);
  for (let i = 0; i < tries; i++) {
    const r = await c.get('/health', { tag: 'health' });
    if (r.ok) return true;
    await sleep(1000);
  }
  return false;
}

const main = async () => {
  const fn = SCENARIOS[cfg.scenario];
  if (!fn) throw new Error(`unknown scenario "${cfg.scenario}" (have: ${Object.keys(SCENARIOS).join(', ')})`);
  if (!cfg.quiet) console.log(`[run] ${cfg.scenario} / ${cfg.model} @ ${cfg.base}`);

  if (!(await waitHealthy(cfg.base))) throw new Error(`API not healthy at ${cfg.base}`);
  const ctx = await bootstrap(cfg.base, { customerCount: cfg.customers });
  if (!cfg.quiet) {
    console.log(`[run] ctx: ${ctx.productIds.length} products, ${ctx.variantIds.length} in-stock variants, ${ctx.checkoutVariantIds.length} checkout variants`);
  }

  // brief warmup to fill caches / JIT
  if (cfg.warmup > 0) {
    const rec0 = new Recorder(); rec0.start();
    await closedLoop({ baseUrl: cfg.base, vus: 3, holdSec: cfg.warmup, iter: fn, rec: rec0, makeCtx: () => ctx });
    rec0.stop();
  }

  const rec = new Recorder();
  const t0 = Date.now();
  rec.start();
  if (cfg.model === 'open') {
    const res = await openLoop({ baseUrl: cfg.base, rps: cfg.rps, seconds: cfg.dur, iter: fn, rec, makeCtx: () => ctx });
    if (!cfg.quiet) console.log(`[run] launched ${res.launched} iterations (target ${cfg.rps}/s x ${cfg.dur}s)`);
  } else {
    await closedLoop({ baseUrl: cfg.base, vus: cfg.vus, rampSec: cfg.ramp, holdSec: cfg.hold, iter: fn, rec, makeCtx: () => ctx });
  }
  rec.stop();

  const meta = { ...cfg, wallSec: +((Date.now() - t0) / 1000).toFixed(1), at: new Date().toISOString() };
  console.log(rec.summary(`${cfg.scenario} ${cfg.model} ${cfg.model === 'open' ? cfg.rps + 'rps' : cfg.vus + 'vu'}`));
  if (cfg.out) {
    mkdirSync(dirname(cfg.out), { recursive: true });
    writeFileSync(cfg.out, JSON.stringify(rec.toJSON(meta), null, 2));
    console.log(`[run] wrote ${cfg.out}`);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
