# Deployment & developer handoff

Ali's Store — a Next.js storefront/admin + an Express/Prisma API + Postgres.

## Architecture

| Piece | Local | Recommended hosting |
|---|---|---|
| Frontend (`frontend/`) | `next dev` on :3000 | **Vercel** (Next.js 16, App Router) |
| Backend API (`backend/`) | `tsx watch` on :4000 | **Railway** or **Fly.io** (Node service) |
| Database | `docker compose up postgres` | **Neon** (serverless Postgres) |
| Images | ImageKit (client-side signed upload) | ImageKit (same) |
| Email | SMTP (any provider) | e.g. Resend / SES / Postmark SMTP |

No Redis: refresh tokens and rate-limit counters live in Postgres / memory
(see `backend/README.md`).

## First-time local setup

```bash
# 1. Database
docker compose up -d postgres          # or point DATABASE_URL at your own PG

# 2. Backend
cd backend
cp .env.example .env                    # fill in the vars below
npm ci
npm run prisma:migrate                 # applies migrations + generates the client
npm run seed                           # demo catalog + one ADMIN user
npm run dev                            # http://localhost:4000

# 3. Frontend
cd ../frontend
cp .env.example .env.local              # NEXT_PUBLIC_API_URL etc.
npm ci
npm run dev                            # http://localhost:3000/en
```

## Environment variables

Full list + defaults: `backend/.env.example`, `frontend/.env.example`. The
ones that **must** be set per environment:

### Backend

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ≥ 32 random chars each; rotate on a schedule |
| `CORS_ORIGIN` | comma-separated allowed origins (the frontend URL) |
| `FRONTEND_URL` | used to build email links (verify, reset, tracking, shipped) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | transactional email; unset ⇒ emails are logged, not sent |
| `IMAGEKIT_PRIVATE_KEY` | signs client upload tokens |
| `HCAPTCHA_SECRET` | checkout email-OTP bot check |
| `OWNER_NOTIFICATION_EMAIL` | where new-order / cancellation alerts go |
| `SEED_ADMIN_PASSWORD` | ≥ 8 chars; the seeded ADMIN account's password |
| `GA_*` (optional) | Google Analytics 4 service account for `/admin/analytics` visitor + funnel reports |
| `NODE_ENV=production` | enables Secure cookies + the global rate limiter |

### Frontend

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | the backend base URL |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | client-side ImageKit uploads |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` (optional) | GA4 tag; only loads after cookie consent |

## Migrations & seeding

```bash
cd backend
npm run prisma:migrate        # dev: create + apply
npx prisma migrate deploy     # prod/CI: apply committed migrations only
npm run seed                  # demo data (idempotent-ish; wipes+reseeds catalog)
npm run seed:empty            # just the singletons + one ADMIN
npm run seed:large            # bulk catalog for load testing
```

The Prisma client is generated on `npm ci` via `prisma generate` — run it
again after any `schema.prisma` change (`npm run prisma:generate`).

## CI

`.github/workflows/ci.yml` runs on every push/PR:

1. **backend** — `npm ci` → `prisma generate` → `typecheck` → `lint` → `test`
   (spins up a `postgres:16` service; the test harness runs
   `prisma migrate deploy` against it).
2. **frontend** — `npm ci` → `typecheck` → `lint` → `test` → `build`.
3. **audit** — `npm audit --audit-level=high` on both (report-only).
4. **deploy-staging** — on `push` to `main` only, POSTs to
   `VERCEL_DEPLOY_HOOK` / `RAILWAY_DEPLOY_HOOK` repo secrets (skips cleanly if
   unset).

Make jobs 1–2 required status checks on the `main` branch to block merges on
failure.

## Deploy steps (per environment)

### Frontend → Vercel

1. Import the repo, set **Root Directory** = `frontend`.
2. Add the `NEXT_PUBLIC_*` env vars.
3. Build command `npm run build`, output auto-detected.
4. (Optional) create a Deploy Hook and store it as `VERCEL_DEPLOY_HOOK` for CI.

### Backend → Railway / Fly

1. Service root = `backend`. Build: `npm ci && npm run build`. Start:
   `npx prisma migrate deploy && npm run start`.
2. Add all backend env vars; set `NODE_ENV=production`.
3. Point `DATABASE_URL` at Neon (use the pooled connection string).
4. (Optional) Deploy Hook → `RAILWAY_DEPLOY_HOOK` for CI.

### Database → Neon

1. Create a project + database; copy the **pooled** connection string into
   `DATABASE_URL`.
2. Migrations are applied by the backend's start command (`migrate deploy`).
3. Enable automated backups / point-in-time restore.

## Load test

```bash
cd backend && npm run loadtest              # zero-install Node smoke, p95/err gate
# or, ramped with thresholds:
k6 run loadtest/storefront.js               # BASE_URL=... for a deployed API
```

See `loadtest/README.md`.

## Frontend performance

```bash
cd frontend
npm run analyze                             # ANALYZE=true next build → .next/analyze/ treemaps
npm run lhci                                # Lighthouse CI: builds, starts, asserts frontend/lighthouserc.json budgets
```

- **Measure production, not `next dev`** — dev bundles are unminified + carry
  the React dev build, so the Lighthouse Performance score there is ~30–50
  points below the shipped app. Use `npm run build && npm start` (or the
  Vercel URL) for a real number.
- `lighthouserc.json` gates: Performance ≥ 0.85, Accessibility ≥ 0.95, LCP
  < 2.5 s, TBT < 300 ms, CLS < 0.1. The `lighthouse` CI job runs it on every
  push/PR against a production build.
- Use `npm run analyze` to confirm the storefront chunk stays lean — the
  admin-only Recharts / analytics kit must not leak into it (it's route-split
  under `/admin/**`).

## Rollback

- **Frontend:** redeploy the previous Vercel deployment (instant).
- **Backend:** redeploy the previous image/commit.
- **Database:** migrations are additive; if one must be undone, write a
  forward "down" migration rather than editing history. Restore from Neon PITR
  for data loss.

## Post-deploy smoke

```bash
curl -fsS "$API/health"                             # {"status":"ok"}
curl -fsS "$API/api/settings" | jq .settings.id     # 1
# then: load /en, add to cart, run guest checkout with a real email.
```

## Handoff checklist

- [ ] Repo secrets set: `VERCEL_DEPLOY_HOOK`, `RAILWAY_DEPLOY_HOOK` (optional),
      plus all runtime env vars in each host.
- [ ] `SEED_ADMIN_PASSWORD` rotated and the seeded ADMIN password changed
      after first login; credentials handed over out-of-band.
- [ ] JWT secrets are unique per environment and on a rotation schedule.
- [ ] Neon backups verified (take one, restore it to a scratch branch).
- [ ] `main` branch protection: require the `backend` + `frontend` CI checks.
- [ ] GA4 service account + measurement ID set if analytics is wanted.
