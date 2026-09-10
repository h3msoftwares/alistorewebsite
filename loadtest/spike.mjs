// Spike test: steady baseline -> sudden 10x -> 20x -> back to baseline.
// Reports per-phase latency/error + time for p95 to return to baseline.
//
//   node loadtest/spike.mjs --base http://127.0.0.1:4000 --scenario mixed
//   --baseline 5 --spike 50 --spike2 100 --phase 45 --recover 120

import { writeFileSync, mkdirSync } from 'node:fs';
import { Recorder } from './lib/stats.mjs';
import { openLoop, sleep } from './lib/runner.mjs';
import { bootstrap, SCENARIOS } from './scenarios/index.mjs';
import { Client } from './lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const cfg = {
  base: arg('base', 'http://127.0.0.1:4000'),
  scenario: arg('scenario', 'mixed'),
  baseline: Number(arg('baseline', 5)),
  spike: Number(arg('spike', 50)),
  spike2: Number(arg('spike2', 100)),
  phase: Number(arg('phase', 45)),
  recover: Number(arg('recover', 120)),
  out: arg('out', 'loadtest/results/spike.json'),
};

const main = async () => {
  const fn = SCENARIOS[cfg.scenario];
  const c = new Client(cfg.base);
  for (let i = 0; i < 30; i++) { if ((await c.get('/health')).ok) break; await sleep(1000); }
  const ctx = await bootstrap(cfg.base, { customerCount: 200 });
  console.log(`[spike] ${cfg.scenario} @ ${cfg.base}  ${cfg.baseline}->${cfg.spike}->${cfg.spike2}->${cfg.baseline} rps`);

  const phases = [
    ['baseline', cfg.baseline, cfg.phase],
    ['spike-10x', cfg.spike, cfg.phase],
    ['spike-20x', cfg.spike2, cfg.phase],
    ['recovery', cfg.baseline, cfg.recover],
  ];
  const results = [];
  let baselineP95 = null;
  for (const [name, rps, seconds] of phases) {
    const rec = new Recorder();
    const startedAt = new Date().toISOString();
    rec.start();
    await openLoop({ baseUrl: cfg.base, rps, seconds, iter: fn, rec, makeCtx: () => ctx });
    rec.stop();
    const o = rec.overall();
    if (name === 'baseline') baselineP95 = o.p95;
    // recovery time: first 10s window whose p95 <= 1.3x baseline
    let recoveredAtSec = null;
    if (name === 'recovery' && baselineP95) {
      for (const w of rec.windows(10)) {
        if (w.p95 <= baselineP95 * 1.3) { recoveredAtSec = w.fromSec; break; }
      }
    }
    results.push({ phase: name, rps, seconds, startedAt, endedAt: new Date().toISOString(), overall: o, windows: rec.windows(10), recoveredAtSec });
    console.log(`[spike] ${name.padEnd(10)} rps=${String(rps).padStart(4)} -> got ${String(o.rps).padStart(6)}/s  p50 ${o.p50}  p95 ${o.p95}  p99 ${o.p99}  max ${o.max}  err ${o.errPct}%  to ${o.timeoutPct}%` + (recoveredAtSec != null ? `  [p95 back to ~baseline by +${recoveredAtSec}s]` : ''));
  }

  mkdirSync('loadtest/results', { recursive: true });
  writeFileSync(cfg.out, JSON.stringify({ cfg, baselineP95, results, at: new Date().toISOString() }, null, 2));
  console.log(`[spike] wrote ${cfg.out}`);
};
main().catch((e) => { console.error(e); process.exit(1); });
