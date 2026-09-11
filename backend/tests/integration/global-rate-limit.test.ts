import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';

// fix-list.md #12, resolves 8.1/8.2/8.4: the app-wide 300 req/min/IP limiter
// used to apply to every request regardless of method, so ordinary read-only
// storefront browsing (GET) from behind any shared IP could exhaust the
// whole per-IP budget on its own — confirmed live at the time (99.72% 429s
// under load, 0% DB CPU throughout). It now skips GET/HEAD/OPTIONS and only
// still counts state-changing requests.
const app = buildApp({ globalRateLimit: true });

describe('Global per-IP rate limiter (fix-list.md #12)', () => {
  it('never 429s GET requests, even well past the old shared cap', async () => {
    // The limiter's own cap is 300/min; fire comfortably past that on GET
    // alone to prove it's genuinely exempted, not just under the ceiling.
    for (let i = 0; i < 310; i++) {
      const res = await request(app).get('/api/collections');
      expect(res.status).not.toBe(429);
    }
  }, 30_000);

  it('still rate-limits state-changing (non-GET) requests', async () => {
    // A nonexistent route still passes through the global limiter (it's
    // mounted ahead of routing), so this doesn't need a real mutation
    // endpoint or its preconditions — just enough POSTs to trip the cap.
    const statuses: number[] = [];
    for (let i = 0; i < 301; i++) {
      const res = await request(app).post('/api/qatest-nonexistent-route').send({});
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 300)).not.toContain(429);
    expect(statuses[300]).toBe(429);
  }, 30_000);
});
