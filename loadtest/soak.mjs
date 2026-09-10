// Soak: sustained moderate load for a long window. Watches for latency drift,
// error creep, and (via the companion monitor.mjs CSV) RSS / DB-connection
// growth. Prints a per-minute line and writes windowed stats.
//
//   node loadtest/soak.mjs --base http://127.0.0.1:4000 --rps 15 --minutes 35 --scenario mixed

import { writeFileSync, mkdirSync } from 'node:fs';
import { Recorder } from './lib/stats.mjs';
import { openLoop, sleep } from './lib/runner.mjs';
import { bootstrap, SCENARIOS } from './scenarios/index.mjs';
import { Client } from './lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const cfg = {
  base: arg('base', 'http://127.0.0.1:4000'),
  scenario: arg('scenario', 'mixed'),
  rps: Number(arg('rps', 15)),
  minutes: Number(arg('minutes', 35)),
  out: arg('out', 'loadtest/results/soak.json'),
};

const main = async () => {
  const fn = SCENARIOS[cfg.scenario];
  const c = new Client(cfg.base);
  for (let i = 0; i < 30; i++) { if ((await c.get('/health')).ok) break; await sleep(1000); }
  const ctx = await bootstrap(cfg.base, { customerCount: 200 });
  const seconds = cfg.minutes * 60;
  console.log(`[soak] ${cfg.scenario} @ ${cfg.base}  ${cfg.rps} rps for ${cfg.minutes} min`);

  const rec = new Recorder();
  rec.start();

  // progress ticker every 60s
  let lastCount = 0;
  const ticker = setInterval(() => {
    const wins = rec.windows(60);
    const w = wins[wins.length - 1];
    if (w) console.log(`[soak] +${String(w.fromSec).padStart(4)}s  n/min ${w.count - 0}  p50 ${w.p50}  p95 ${w.p95}  p99 ${w.p99}  err ${w.errPct}%  to ${w.timeoutPct}%`);
    lastCount = rec.samples.length;
  }, 60000);

  await openLoop({ baseUrl: cfg.base, rps: cfg.rps, seconds, iter: fn, rec, makeCtx: () => ctx });
  clearInterval(ticker);
  rec.stop();

  const wins = rec.windows(60);
  const first = wins.slice(0, 5); // first 5 min
  const last = wins.slice(-5); // last 5 min
  const avg = (arr, k) => +(arr.reduce((s, w) => s + w[k], 0) / Math.max(arr.length, 1)).toFixed(1);
  const drift = {
    p95_first5min: avg(first, 'p95'), p95_last5min: avg(last, 'p95'),
    p99_first5min: avg(first, 'p99'), p99_last5min: avg(last, 'p99'),
    err_first5min: avg(first, 'errPct'), err_last5min: avg(last, 'errPct'),
  };
  console.log(rec.summary(`soak ${cfg.rps}rps ${cfg.minutes}min`));
  console.log('[soak] drift ' + JSON.stringify(drift));

  mkdirSync('loadtest/results', { recursive: true });
  writeFileSync(cfg.out, JSON.stringify({ cfg, drift, windows: wins, ...rec.toJSON({ ...cfg }), at: new Date().toISOString() }, null, 2));
  console.log(`[soak] wrote ${cfg.out}`);
};
main().catch((e) => { console.error(e); process.exit(1); });
