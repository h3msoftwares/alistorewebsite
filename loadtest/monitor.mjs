// Resource sampler for a load run. Every INTERVAL ms records:
//   API process: CPU% (of one core), working-set / private bytes, threads, handles
//   Postgres:    backend count, active queries, waiting locks, xact age
// -> CSV at loadtest/results/monitor-<label>.csv, plus a summary (idle/peak) on stop.
//
//   node loadtest/monitor.mjs --pid <apiPid> --pg "postgresql://alistore:alistore@127.0.0.1:5544/alistore" --label vus20 --interval 1000
// If --pid is omitted it reads loadtest/results/api.pid.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }

const pid = Number(arg('pid', 0)) || Number(readFileSync(resolve(ROOT, 'loadtest/results/api.pid'), 'utf8').trim());
const pg = arg('pg', 'postgresql://alistore:alistore@127.0.0.1:5544/alistore');
const label = arg('label', 'run');
const interval = Number(arg('interval', 1000));
const durationSec = Number(arg('dur', 0)); // 0 = until SIGINT
const PSQL = process.platform === 'win32' ? `"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"` : 'psql';

mkdirSync(resolve(ROOT, 'loadtest/results'), { recursive: true });
const csv = resolve(ROOT, `loadtest/results/monitor-${label}.csv`);
writeFileSync(csv, 'ts,elapsed_s,api_cpu_pct,api_ws_mb,api_priv_mb,api_threads,api_handles,pg_backends,pg_active,pg_waiting,pg_max_xact_s\n');

const NCPU = os.cpus().length || 1;

let lastCpu = null; // { time, kernel+user ms }
function apiSample() {
  try {
    if (process.platform === 'win32') {
      const ps = `powershell -NoProfile -Command "$p=Get-Process -Id ${pid} -ErrorAction Stop; '{0}|{1}|{2}|{3}|{4}' -f $p.TotalProcessorTime.TotalMilliseconds,$p.WorkingSet64,$p.PrivateMemorySize64,$p.Threads.Count,$p.HandleCount"`;
      const [cpuMs, ws, priv, threads, handles] = execSync(ps, { encoding: 'utf8' }).trim().split('|').map(Number);
      const now = performance.now();
      let cpuPct = 0;
      if (lastCpu) cpuPct = ((cpuMs - lastCpu.cpuMs) / (now - lastCpu.time)) * 100; // % of one core
      lastCpu = { time: now, cpuMs };
      return { cpuPct, wsMb: ws / 1048576, privMb: priv / 1048576, threads, handles };
    } else {
      const out = execSync(`ps -p ${pid} -o %cpu=,rss=,nlwp=`, { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
      return { cpuPct: out[0], wsMb: out[1] / 1024, privMb: out[1] / 1024, threads: out[2], handles: 0 };
    }
  } catch {
    return { cpuPct: -1, wsMb: -1, privMb: -1, threads: -1, handles: -1 };
  }
}

// Write the query once to a temp file — avoids all Windows inline-quoting hell.
const PG_SQL_FILE = resolve(tmpdir(), `monitor-pg-${process.pid}.sql`);
writeFileSync(
  PG_SQL_FILE,
  "SELECT count(*), count(*) FILTER (WHERE state='active'), " +
  "count(*) FILTER (WHERE wait_event_type='Lock'), " +
  "COALESCE(EXTRACT(EPOCH FROM max(now()-xact_start)),0) " +
  "FROM pg_stat_activity WHERE datname='alistore';\n"
);
function pgSample() {
  try {
    const line = execSync(`${PSQL} "${pg}" -tA --field-separator="|" --no-align -f "${PG_SQL_FILE}"`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const [backends, active, waiting, maxXact] = line.split('|').map(Number);
    return { backends, active, waiting, maxXact: +(+maxXact).toFixed(1) };
  } catch {
    return { backends: -1, active: -1, waiting: -1, maxXact: -1 };
  }
}

const t0 = Date.now();
const rows = [];
console.log(`[monitor] pid=${pid} label=${label} interval=${interval}ms cores=${NCPU} -> ${csv}`);
const tick = () => {
  const a = apiSample();
  const p = pgSample();
  const el = ((Date.now() - t0) / 1000).toFixed(1);
  const line = [new Date().toISOString(), el, a.cpuPct.toFixed(1), a.wsMb.toFixed(1), a.privMb.toFixed(1), a.threads, a.handles, p.backends, p.active, p.waiting, p.maxXact].join(',');
  appendFileSync(csv, line + '\n');
  rows.push({ ...a, ...p, el: Number(el) });
  if (durationSec && (Date.now() - t0) / 1000 >= durationSec) finish();
};
const timer = setInterval(tick, interval);

function finish() {
  clearInterval(timer);
  const valid = rows.filter((r) => r.cpuPct >= 0);
  const nums = (k) => valid.map((r) => r[k]).sort((a, b) => a - b);
  const p = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.ceil(q / 100 * arr.length) - 1)] : 0;
  const cpu = nums('cpuPct'), ws = nums('wsMb'), be = nums('backends'), xa = nums('maxXact');
  const sum = {
    label, samples: valid.length,
    api_cpu_pct: { p50: +p(cpu, 50).toFixed(1), p95: +p(cpu, 95).toFixed(1), max: +(cpu[cpu.length - 1] || 0).toFixed(1) },
    api_ws_mb: { min: +(ws[0] || 0).toFixed(1), p50: +p(ws, 50).toFixed(1), max: +(ws[ws.length - 1] || 0).toFixed(1) },
    pg_backends: { p50: p(be, 50), max: be[be.length - 1] || 0 },
    pg_max_xact_s: { p95: +p(xa, 95).toFixed(1), max: +(xa[xa.length - 1] || 0).toFixed(1) },
  };
  writeFileSync(resolve(ROOT, `loadtest/results/monitor-${label}.summary.json`), JSON.stringify(sum, null, 2));
  console.log('[monitor] ' + JSON.stringify(sum));
  process.exit(0);
}
process.on('SIGINT', finish);
process.on('SIGTERM', finish);
