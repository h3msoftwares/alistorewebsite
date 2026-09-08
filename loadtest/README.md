# Load testing

NFR target: **50–100 concurrent users** on the read-heavy storefront path with
p95 latency < 800 ms and < 1% errors.

## Option A — k6 (recommended, ramped + thresholds)

Install k6: <https://k6.io/docs/get-started/installation>

```bash
# local API
k6 run loadtest/storefront.js

# tune
VUS=50 DURATION=1m k6 run loadtest/storefront.js

# against a deployed API
BASE_URL=https://api.your-domain.com k6 run loadtest/storefront.js
```

k6 exits non-zero if a `thresholds` check fails, so it can gate a pipeline.

## Option B — zero-install Node smoke

No k6 required (Node 18+):

```bash
node loadtest/quick.mjs
CONCURRENCY=100 DURATION=60 node loadtest/quick.mjs
BASE_URL=https://api.your-domain.com node loadtest/quick.mjs
```

Prints p50/p95/p99 latency + error rate and exits non-zero if p95 ≥ 800 ms or
errors ≥ 1%.

## What it exercises

`GET /api/settings`, `/api/collections`, `/api/categories`,
`/api/products` (plain + `?onSale=true`), and `/api/products/:id`. These are
the unauthenticated reads that every storefront page fans out to. Write paths
(cart, checkout) need a session cookie + CSRF token and are covered by the
integration + E2E suites rather than the load test.

## Before running against a real database

Seed realistic volume so the query planner behaves like production:

```bash
cd backend && npm run seed:large
```
