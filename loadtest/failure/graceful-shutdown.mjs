// Graceful-shutdown drill: put steady load on the API, send SIGTERM mid-run,
// measure (1) how in-flight requests resolve, (2) whether NEW requests are
// refused promptly, (3) time to process exit, (4) exit code.
//
//   node loadtest/failure/graceful-shutdown.mjs --base http://127.0.0.1:4000 --apipid <pid> --rps 10 --killAt 8
//
// NOTE: this stops the API. Restart it afterwards with start-api.mjs.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { Recorder } from '../lib/stats.mjs';
import { openLoop, sleep } from '../lib/runner.mjs';
import { bootstrap, hit } from '../scenarios/index.mjs';
import { Client } from '../lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const cfg = {
  base: arg('base', 'http://127.0.0.1:4000'),
  apipid: Number(arg('apipid', 0)) || Number(readFileSync('loadtest/results/api.pid', 'utf8').trim()),
  rps: Number(arg('rps', 10)),
  total: Number(arg('total', 25)),
  killAt: Number(arg('killAt', 8)),
  out: arg('out', 'loadtest/results/failure-graceful-shutdown.json'),
};

const alive = () => { try { execFileSync('powershell', ['-NoProfile', '-Command', `Get-Process -Id ${cfg.apipid} -ErrorAction Stop|Out-Null`], { stdio: 'pipe' }); return true; } catch { return false; } };
// Node on Windows has no real SIGTERM; taskkill without /F posts WM_CLOSE which
// Node maps to 'SIGTERM' for a console app. Fall back to a CTRL_BREAK via
// windows-kill semantics is overkill here — taskkill (no /F) is what a service
// manager effectively does.
const sigterm = () => { try { execFileSync('taskkill', ['/PID', String(cfg.apipid), '/T'], { stdio: 'pipe' }); return true; } catch (e) { console.error('[gs] taskkill:', e.stdout?.toString() || e.message); return false; } };

const main = async () => {
  const c = new Client(cfg.base);
  if (!(await c.get('/health')).ok) throw new Error('API not healthy at start');
  const ctx = await bootstrap(cfg.base, { customerCount: 50 });
  console.log(`[gs] ${cfg.rps} rps, SIGTERM api pid ${cfg.apipid} @ +${cfg.killAt}s`);

  const rec = new Recorder(); rec.start();
  const t0 = Date.now();
  let termAt = null, exitAt = null, termSent = false;

  const killTimer = setTimeout(() => { termSent = sigterm(); termAt = (Date.now() - t0) / 1000; console.log(`[gs] +${termAt.toFixed(1)}s  SIGTERM sent (${termSent})`); }, cfg.killAt * 1000);
  const exitPoll = setInterval(() => { if (termSent && exitAt == null && !alive()) { exitAt = (Date.now() - t0) / 1000; console.log(`[gs] +${exitAt.toFixed(1)}s  process exited`); } }, 250);

  await openLoop({ baseUrl: cfg.base, rps: cfg.rps, seconds: cfg.total, iter: hit, rec, makeCtx: () => ctx });
  rec.stop(); clearTimeout(killTimer); clearInterval(exitPoll);
  if (exitAt == null && !alive()) exitAt = (Date.now() - t0) / 1000;

  // classify requests by whether they started before or after SIGTERM
  const byPhase = { beforeTerm: [], afterTerm: [] };
  for (const s of rec.samples) {
    const rel = (s.t - rec.startedAt) / 1000;
    (rel < (termAt ?? 1e9) ? byPhase.beforeTerm : byPhase.afterTerm).push(s);
  }
  const phaseAgg = (rows) => ({ n: rows.length, ok: rows.filter((r) => r.ok).length, refusedFast: rows.filter((r) => !r.ok && r.ms < 200).length, timedOut: rows.filter((r) => r.timedOut).length });

  const summary = {
    cfg, termAt, exitAt,
    drainSec: termAt != null && exitAt != null ? +(exitAt - termAt).toFixed(2) : null,
    beforeTerm: phaseAgg(byPhase.beforeTerm),
    afterTerm: phaseAgg(byPhase.afterTerm),
    apiLogTail: safeTail('loadtest/results/api.log', 12),
    overall: rec.overall(),
  };
  mkdirSync('loadtest/results', { recursive: true });
  writeFileSync(cfg.out, JSON.stringify(summary, null, 2));
  console.log(`[gs] drain time (SIGTERM -> exit): ${summary.drainSec}s`);
  console.log(`[gs] in-flight-at-term requests: ${JSON.stringify(summary.beforeTerm)}`);
  console.log(`[gs] post-term requests:        ${JSON.stringify(summary.afterTerm)}  (want: refused fast, not hung)`);
  console.log(`[gs] wrote ${cfg.out}`);
};
function safeTail(p, n) { try { return readFileSync(p, 'utf8').trim().split(/\r?\n/).slice(-n); } catch { return []; } }
main().catch((e) => { console.error(e); process.exit(1); });
