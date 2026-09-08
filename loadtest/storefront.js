// k6 load test for the read-heavy storefront path — the NFR target is
// 50–100 concurrent users with acceptable latency.
//
//   Run:  k6 run loadtest/storefront.js
//   Against a deployed API:  BASE_URL=https://api.example.com k6 run loadtest/storefront.js
//   Lighter/heavier:         VUS=50 DURATION=1m k6 run loadtest/storefront.js
//
// k6 is a standalone binary (https://k6.io/docs/get-started/installation).
// For a zero-install smoke test without k6, use `node loadtest/quick.mjs`.

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '2m';

const errors = new Rate('storefront_errors');

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.round(VUS / 2) },
        { duration: '30s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // NFR: the storefront stays responsive at target concurrency.
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
    storefront_errors: ['rate<0.01'],
  },
};

function get(path) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { name: path.split('?')[0] } });
  const ok = check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status < 300 });
  errors.add(!ok);
  return res;
}

export default function () {
  group('home + catalog', () => {
    get('/api/settings');
    get('/api/collections');
    get('/api/categories');
  });

  group('product listing + detail', () => {
    const list = get('/api/products?page=1&pageSize=24');
    let firstId;
    try {
      firstId = list.json('items.0.id');
    } catch (_) {
      firstId = undefined;
    }
    if (firstId) {
      get(`/api/products/${firstId}`);
    }
    get('/api/products?onSale=true&page=1&pageSize=24');
  });

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time
}
