// Zero-dependency load smoke test — no k6 needed, just Node 18+ (built-in fetch).
// Fires a fixed pool of concurrent workers hammering the read-heavy storefront
// endpoints for a set duration, then prints latency percentiles + error rate.
//
//   node loadtest/quick.mjs
//   BASE_URL=https://api.example.com CONCURRENCY=100 DURATION=60 node loadtest/quick.mjs
//
// For a proper ramped test with thresholds, use `k6 run loadtest/storefront.js`.

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const CONCURRENCY = Number(process.env.CONCURRENCY || 75);
const DURATION_S = Number(process.env.DURATION || 30);

const PATHS = [
  '/api/settings',
  '/api/collections',
  '/api/categories',
  '/api/products?page=1&pageSize=24',
  '/api/products?onSale=true&page=1&pageSize=24',
];

const latencies = [];
let ok = 0;
let failed = 0;
let productId = null;

async function warmUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/products?page=1&pageSize=1`);
    const body = await res.json();
    productId = body?.items?.[0]?.id ?? null;
  } catch {
    /* ignore — worker requests will surface the failure */
  }
}

async function hit(path) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    latencies.push(performance.now() - start);
    if (res.ok) ok++;
    else failed++;
    // Drain the body so the socket is freed.
    await res.arrayBuffer();
  } catch {
    latencies.push(performance.now() - start);
    failed++;
  }
}

async function worker(deadline) {
  while (performance.now() < deadline) {
    const path = PATHS[Math.floor(Math.random() * PATHS.length)];
    await hit(path);
    if (productId && Math.random() < 0.4) await hit(`/api/products/${productId}`);
  }
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const main = async () => {
  console.log(`Load smoke → ${BASE_URL}  (${CONCURRENCY} workers, ${DURATION_S}s)\n`);
  await warmUp();
  const deadline = performance.now() + DURATION_S * 1000;
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(deadline)));

  const sorted = latencies.slice().sort((a, b) => a - b);
  const total = ok + failed;
  const rps = total / DURATION_S;
  const errRate = total ? (failed / total) * 100 : 0;

  console.log(`requests   : ${total}  (${rps.toFixed(1)}/s)`);
  console.log(`ok / failed: ${ok} / ${failed}  (${errRate.toFixed(2)}% errors)`);
  console.log(`latency p50 : ${pct(sorted, 50).toFixed(0)} ms`);
  console.log(`latency p95 : ${pct(sorted, 95).toFixed(0)} ms`);
  console.log(`latency p99 : ${pct(sorted, 99).toFixed(0)} ms`);
  console.log(`latency max : ${(sorted[sorted.length - 1] || 0).toFixed(0)} ms`);

  // NFR gate: mirror the k6 thresholds so CI / a local run can fail loudly.
  const p95 = pct(sorted, 95);
  const bad = errRate >= 1 || p95 >= 800;
  console.log(`\n${bad ? '✗ FAIL' : '✓ PASS'}  (target: p95 < 800 ms, errors < 1%)`);
  process.exit(bad ? 1 : 0);
};

main();
