// Two load models over a scenario function `iter(client, ctx)`:
//   closedLoop  — N concurrent virtual users, each looping iter() back-to-back
//                 (think-time lives inside the scenario). Ramp VUs up smoothly.
//   openLoop    — fire iter() at a target arrival rate (req/s) regardless of
//                 how long each takes; bounded in-flight so a stalled server
//                 can't make the driver explode.
// `stages` chains either model across [{target, seconds}] steps (spike/ramp).

import { Client } from './http.mjs';

const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * closedLoop({ baseUrl, vus, rampSec, holdSec, iter, rec, makeCtx })
 * makeCtx(i) -> per-VU context (e.g. a logged-in client). Optional.
 */
export async function closedLoop({ baseUrl, vus, rampSec = 0, holdSec, iter, rec, makeCtx }) {
  const deadline = now() + (rampSec + holdSec) * 1000;
  const workers = [];
  for (let i = 0; i < vus; i++) {
    const startDelay = rampSec > 0 ? (i / vus) * rampSec * 1000 : 0;
    workers.push((async () => {
      await sleep(startDelay);
      const client = new Client(baseUrl);
      const ctx = makeCtx ? await makeCtx(i, client) : {};
      while (now() < deadline) {
        try {
          const results = await iter(client, ctx);
          for (const r of [].concat(results || [])) if (r && typeof r.ms === 'number') rec.add(r);
        } catch (e) {
          rec.add({ tag: 'iter-throw', status: 0, ms: 0, ok: false, timedOut: false, error: String(e?.message || e) });
        }
      }
    })());
  }
  await Promise.all(workers);
}

/**
 * openLoop({ baseUrl, rps, seconds, iter, rec, maxInflight, makeCtx })
 * Poisson-ish spacing. Each fire gets a fresh Client unless makeCtx pins one.
 */
export async function openLoop({ baseUrl, rps, seconds, iter, rec, maxInflight = 2000, makeCtx }) {
  const end = now() + seconds * 1000;
  let inflight = 0;
  let launched = 0;
  const meanGap = 1000 / rps;
  const pending = new Set();

  const sharedCtxClient = makeCtx ? new Client(baseUrl) : null;
  const sharedCtx = makeCtx ? await makeCtx(0, sharedCtxClient) : null;

  while (now() < end) {
    // exponential inter-arrival for a Poisson process at rate `rps`
    const gap = -Math.log(1 - Math.random()) * meanGap;
    await sleep(gap);
    if (inflight >= maxInflight) {
      rec.add({ tag: 'shed-inflight-cap', status: 0, ms: 0, ok: false, timedOut: false, error: 'MAXINFLIGHT' });
      continue;
    }
    launched++;
    inflight++;
    const client = makeCtx ? sharedCtxClient : new Client(baseUrl);
    const p = (async () => {
      try {
        const results = await iter(client, sharedCtx || {});
        for (const r of [].concat(results || [])) if (r && typeof r.ms === 'number') rec.add(r);
      } catch (e) {
        rec.add({ tag: 'iter-throw', status: 0, ms: 0, ok: false, timedOut: false, error: String(e?.message || e) });
      } finally {
        inflight--;
        pending.delete(p);
      }
    })();
    pending.add(p);
  }
  await Promise.allSettled([...pending]);
  return { launched };
}

/**
 * stages(model, steps, common) — run steps sequentially.
 *   model: 'open' | 'closed'
 *   steps: [{ target, seconds }]  (target = rps for open, vus for closed)
 */
export async function stages(model, steps, common) {
  for (const s of steps) {
    const label = `${model}:${s.target} for ${s.seconds}s`;
    if (common.onStage) common.onStage(label, s);
    if (model === 'open') {
      await openLoop({ ...common, rps: s.target, seconds: s.seconds });
    } else {
      await closedLoop({ ...common, vus: s.target, rampSec: 0, holdSec: s.seconds });
    }
  }
}

export { sleep };
