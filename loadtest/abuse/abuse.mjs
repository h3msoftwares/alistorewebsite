// Security + performance abuse probes. Each asserts the server responds
// correctly and CHEAPLY (no CPU/RAM runaway, no crash, no hang).
//
//   node loadtest/abuse/abuse.mjs --base http://127.0.0.1:4000 --apipid <pid>

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { Client } from '../lib/http.mjs';

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; }
const base = arg('base', 'http://127.0.0.1:4000');
const apipid = Number(arg('apipid', 0)) || Number(readFileSync('loadtest/results/api.pid', 'utf8').trim());

function rss() {
  try {
    return Number(execFileSync('powershell', ['-NoProfile', '-Command', `[math]::Round((Get-Process -Id ${apipid}).WorkingSet64/1MB,1)`], { encoding: 'utf8' }).trim());
  } catch { return -1; }
}
const alive = () => rss() > 0;

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`); };

const main = async () => {
  const c = new Client(base);
  await c.primeCsrf();
  const rssStart = rss();

  // 1. Oversized JSON body -> 413, fast, no console flood
  {
    const big = JSON.stringify({ x: 'A'.repeat(500 * 1024) });
    const t = performance.now();
    const rr = await fetch(base + '/api/cart/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: big }).then((x) => ({ status: x.status })).catch((e) => ({ status: 0, err: String(e) }));
    check('oversized JSON (500KB) -> 413', rr.status === 413, `status ${rr.status}, ${(performance.now() - t).toFixed(0)}ms`);
  }

  // 2. Huge query string
  {
    const r = await c.get('/api/products?search=' + 'x'.repeat(20000) + '&page=1&pageSize=24', { tag: 'hugeqs' });
    check('20KB query string -> handled (4xx/2xx, no 5xx)', r.status < 500, `status ${r.status}`);
  }

  // 3. Invalid pagination
  for (const [q, label] of [['page=-1&pageSize=24', 'page=-1'], ['page=1&pageSize=999999', 'pageSize=999999'], ['page=abc&pageSize=xyz', 'non-numeric']]) {
    const r = await c.get(`/api/products?${q}`, { tag: 'badpage' });
    check(`bad pagination (${label}) -> 4xx or clamped 2xx, not 5xx`, r.status < 500, `status ${r.status}`);
  }

  // 4. Invalid id param
  {
    const r = await c.get('/api/products/not-a-uuid', { tag: 'badid' });
    check('invalid product id -> 400/404, not 5xx', r.status === 400 || r.status === 404, `status ${r.status}`);
  }

  // 5. Unexpected content-type on a POST that expects JSON
  {
    const rr = await fetch(base + '/api/cart/items', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'variantId=x' }).then((x) => ({ status: x.status })).catch(() => ({ status: 0 }));
    check('wrong content-type on JSON POST -> 4xx, not 5xx', rr.status >= 400 && rr.status < 500, `status ${rr.status}`);
  }

  // 6. Many idle concurrent connections held open (socket exhaustion probe)
  {
    const controllers = [];
    const holds = [];
    for (let i = 0; i < 200; i++) {
      const ac = new AbortController();
      controllers.push(ac);
      holds.push(fetch(base + '/api/products?page=1&pageSize=24', { signal: ac.signal }).catch(() => {}));
    }
    await new Promise((r) => setTimeout(r, 3000));
    const during = rss();
    const stillServes = (await new Client(base).get('/health')).ok;
    controllers.forEach((a) => a.abort());
    await Promise.allSettled(holds);
    check('200 concurrent connections -> still serves /health, RSS bounded', stillServes && during > 0 && during < 900, `serves=${stillServes} rss=${during}MB`);
  }

  const rssEnd = rss();
  check('process alive after all probes', alive(), `rss ${rssStart} -> ${rssEnd} MB`);

  mkdirSync('loadtest/results', { recursive: true });
  writeFileSync('loadtest/results/abuse.json', JSON.stringify({ base, rssStart, rssEnd, results, at: new Date().toISOString() }, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`[abuse] ${failed.length ? failed.length + ' FAILED' : 'ALL PASS'}  (rss ${rssStart} -> ${rssEnd} MB)`);
  process.exit(failed.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
