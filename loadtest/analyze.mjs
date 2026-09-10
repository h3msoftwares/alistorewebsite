// Join a sweep/spike JSON (stage wall-clock boundaries) with a monitor CSV
// (1 Hz resource samples) and emit a markdown table: load step x latency
// percentiles x error/timeout x API CPU/RSS x PG backends.
//
//   node loadtest/analyze.mjs --sweep loadtest/results/sweep-vus-mixed.json \
//        --monitor loadtest/results/monitor-sweep-vus2.csv --label "VU sweep (mixed)"

import { readFileSync, writeFileSync } from 'node:fs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const sweepPath = arg('sweep');
const monPath = arg('monitor');
const label = arg('label', sweepPath);
const outMd = arg('out', sweepPath.replace(/\.json$/, '.md'));

const sweep = JSON.parse(readFileSync(sweepPath, 'utf8'));
const monRows = monPath
  ? readFileSync(monPath, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => {
      const [ts, el, cpu, ws, priv, thr, hnd, be, act, wait, xact] = l.split(',');
      return { t: Date.parse(ts), cpu: +cpu, ws: +ws, be: +be, wait: +wait, xact: +xact };
    })
  : [];

function monWindow(fromISO, toISO) {
  const a = Date.parse(fromISO), b = Date.parse(toISO);
  const rows = monRows.filter((r) => r.t >= a && r.t <= b && r.cpu >= 0);
  if (!rows.length) return null;
  const s = (k) => rows.map((r) => r[k]).sort((x, y) => x - y);
  const p = (arr, q) => arr[Math.min(arr.length - 1, Math.ceil(q / 100 * arr.length) - 1)] || 0;
  const cpu = s('cpu'), ws = s('ws'), be = s('be'), xact = s('xact');
  return {
    cpuP50: +p(cpu, 50).toFixed(0), cpuP95: +p(cpu, 95).toFixed(0), cpuMax: +cpu[cpu.length - 1].toFixed(0),
    wsMaxMb: +ws[ws.length - 1].toFixed(0),
    beMax: be[be.length - 1] || 0,
    xactMaxS: +(+xact[xact.length - 1] || 0).toFixed(1),
  };
}

const rows = sweep.rows || sweep.results?.map((r) => ({ step: r.phase, kind: 'phase', startedAt: r.startedAt, endedAt: r.endedAt, overall: r.overall })) || [];

const head = `## ${label}\n\n` +
  `| step | actual rps | p50 ms | p90 ms | p95 ms | p99 ms | max ms | err % | timeout % | API CPU%/core (p50 / p95 / max) | API RSS max MB | PG backends max | longest xact s |\n` +
  `|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
const body = rows.map((r) => {
  const o = r.overall;
  const m = monWindow(r.startedAt, r.endedAt);
  const mCell = m ? `${m.cpuP50} / ${m.cpuP95} / ${m.cpuMax}` : '—';
  return `| ${r.step} | ${o.rps} | ${o.p50} | ${o.p90} | ${o.p95} | ${o.p99} | ${o.max} | ${o.errPct} | ${o.timeoutPct} | ${mCell} | ${m?.wsMaxMb ?? '—'} | ${m?.beMax ?? '—'} | ${m?.xactMaxS ?? '—'} |`;
}).join('\n');

const md = head + body + '\n';
writeFileSync(outMd, md);
console.log(md);
console.log(`[analyze] wrote ${outMd}`);
