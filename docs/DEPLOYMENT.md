# Deployment & developer handoff

Ali's Store — a Next.js storefront/admin + an Express/Prisma API + Postgres.

## Architecture

| Piece | Local | Recommended hosting |
|---|---|---|
| Frontend (`frontend/`) | `next dev` on :3000 | **Netlify** (`@netlify/plugin-nextjs`, App Router) |
| Backend API (`backend/`) | `tsx watch` on :4000 | **Railway** (Node service) |
| Database | `docker compose up postgres` | **Supabase** (managed Postgres) |
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
| `DATABASE_URL` | Postgres connection string. On Supabase use the **Session pooler** URI (Project Settings → Database → Connection string → "Session pooler", port 5432) as the single value here — it supports both the app's normal queries and `prisma migrate deploy`. The **Transaction pooler** (port 6543, `pgbouncer=true`) breaks `prisma migrate deploy` (no prepared-statement/advisory-lock support) since this schema has no separate `directUrl`; don't use it. |
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
| `BACKEND_URL` | **this API's own public URL** (e.g. `https://api.yourdomain.com`) — builds the Google Drive OAuth callback redirect_uri for the admin panel's "Connect Google Drive" button. Must exactly match an Authorized redirect URI registered on the "Web application" OAuth client in Google Cloud Console (path: `/api/admin/backup/drive/callback`) — see security/operations.md §3. |
| `GOOGLE_DRIVE_WEB_CLIENT_ID` / `_SECRET` | the "Web application" OAuth client backing "Connect Google Drive". Required for that button to work at all in this environment. |
| `GOOGLE_DRIVE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` / `_BACKUP_FOLDER_ID` (optional) | the original "Desktop app" client + its refresh token — bootstrap path for the scheduled GitHub Actions backup and the fallback until an admin connects via the panel. Not required if the panel connect is used instead (see below). |

### Frontend

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | **Browser-side** calls only. Local dev: the backend base URL (`http://localhost:4000`). **In Netlify, set this to an empty string.** The frontend (Netlify) and backend (Railway) are different domains; pointed straight at Railway, the backend's `SameSite=Strict` auth/CSRF/cart cookies are cross-site and the browser never sends them back, so every login/cart/checkout POST 403s with "Invalid or missing CSRF token" (confirmed live 2026-09-16). An empty value makes the frontend call relative `/api/...` paths, which `netlify.toml`'s `[[redirects]]` rule proxies to Railway same-origin — the browser then sees one origin and the cookies work as intended. |
| `API_SERVER_URL` | **Server-side** (build-time/SSR) calls only — the root layout's prefetches run in Node, not a browser, so they need Railway's real absolute URL even though `NEXT_PUBLIC_API_URL` above is empty (a relative path has no base to resolve against server-side). Not `NEXT_PUBLIC_`-prefixed, so it stays server-only and never ships to the browser. In Netlify, set to the Railway backend's public URL. Leave unset in local dev. |
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
   `NETLIFY_DEPLOY_HOOK` / `RAILWAY_DEPLOY_HOOK` repo secrets (skips cleanly if
   unset).

Make jobs 1–2 required status checks on the `main` branch to block merges on
failure.

## Deploy steps (per environment)

### Database → Supabase (set this up first — the other two need `DATABASE_URL`)

1. Create a project (choose a region close to the Railway region you'll use).
2. Project Settings → Database → Connection string → **Session pooler** (port
   5432) → copy it as `DATABASE_URL` (fill in the database password you set
   at project creation).
3. Migrations run via the backend's Railway start command (`migrate deploy`,
   see below) — nothing to apply manually.
4. Point-in-time recovery / daily backups are on by default on paid Supabase
   tiers; confirm the retention window matches your needs.

### Backend → Railway

`backend/railway.json` in this repo already declares the build/start/health
config below — Railway auto-detects it once the service's Root Directory is
set.

1. New service from this repo, **Root Directory** = `backend`.
2. Build: `npm ci && npm run prisma:generate && npm run build`. Start:
   `npx prisma migrate deploy && npm run start`. Health check: `/health`.
   (All three come from `backend/railway.json`.)
3. Add all backend env vars from the table above; set `NODE_ENV=production`.
4. `DATABASE_URL` = the Supabase Session pooler URI from the step above.
5. `CORS_ORIGIN` / `FRONTEND_URL` = the Netlify site's URL (below).
6. `BACKEND_URL` = this Railway service's own public URL (needed for the
   Google Drive OAuth callback — see the table above).
7. (Optional) Settings → Deploy Triggers → create a Deploy Hook, store it as
   the `RAILWAY_DEPLOY_HOOK` repo secret for CI.

### Frontend → Netlify

`netlify.toml` at the repo root already declares the base directory, build
command, the `@netlify/plugin-nextjs` runtime (installed automatically by
Netlify even though it isn't in `frontend/package.json`), and a `/api/*`
redirect proxying to the Railway backend so the browser only ever talks to
this one Netlify origin — see that file's comment for why (in short: the
backend's cookies are `SameSite=Strict`, which never round-trip if the
frontend calls Railway's domain directly).

1. Import the repo — Netlify reads `netlify.toml` and needs no manual build
   settings (base directory `frontend`, command `npm run build`).
2. Add the frontend env vars (Site configuration → Environment variables).
   **`NEXT_PUBLIC_API_URL` = an empty string** — leave it blank, don't put
   the Railway URL here. **`API_SERVER_URL` = the Railway backend's public
   URL** — the opposite of `NEXT_PUBLIC_API_URL`, this one DOES need the
   real Railway URL, since it's for server-side (build/SSR) calls only (see
   the table above and `netlify.toml`'s `[[redirects]]` comment for why the
   two differ).
3. If `netlify.toml`'s hardcoded redirect target ever needs to change (e.g.
   the Railway service is recreated under a new domain), update the `to =`
   line in its `[[redirects]]` block — Netlify redirects don't read env vars.
4. (Optional) Site configuration → Build & deploy → Deploy notifications →
   add a Build hook, store it as the `NETLIFY_DEPLOY_HOOK` repo secret for CI.

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
  Netlify URL) for a real number.
- `lighthouserc.json` gates: Performance ≥ 0.85, Accessibility ≥ 0.95, LCP
  < 2.5 s, TBT < 300 ms, CLS < 0.1. The `lighthouse` CI job runs it on every
  push/PR against a production build.
- Use `npm run analyze` to confirm the storefront chunk stays lean — the
  admin-only Recharts / analytics kit must not leak into it (it's route-split
  under `/admin/**`).

## Rollback

- **Frontend:** Netlify → Deploys → pick the previous deploy → "Publish deploy"
  (instant, no rebuild).
- **Backend:** Railway → Deployments → redeploy the previous one.
- **Database:** migrations are additive; if one must be undone, write a
  forward "down" migration rather than editing history. Restore from
  Supabase's point-in-time recovery for data loss.

## Post-deploy smoke

```bash
curl -fsS "$API/health"                             # {"status":"ok"}
curl -fsS "$API/api/settings" | jq .settings.id     # 1
# then: load /en, add to cart, run guest checkout with a real email.
```

## Handoff checklist

- [ ] Repo secrets set: `NETLIFY_DEPLOY_HOOK`, `RAILWAY_DEPLOY_HOOK` (optional),
      plus all runtime env vars in each host.
- [ ] `SEED_ADMIN_PASSWORD` rotated and the seeded ADMIN password changed
      after first login; credentials handed over out-of-band.
- [ ] JWT secrets are unique per environment and on a rotation schedule.
- [ ] Supabase backups verified (confirm PITR is on / take a manual backup
      and check it restores).
- [ ] `main` branch protection: require the `backend` + `frontend` CI checks.
- [ ] GA4 service account + measurement ID set if analytics is wanted.
- [ ] **Google Drive backups (modules/backup)** — see security/operations.md §3
      for full detail:
  - [ ] `BACKEND_URL` set to the real backend URL (not `localhost`).
  - [ ] The production callback — `${BACKEND_URL}/api/admin/backup/drive/callback`
        — added as an Authorized redirect URI on the "Web application" OAuth
        client in Google Cloud Console (keep the existing entries, add this
        one alongside them).
  - [ ] `GOOGLE_DRIVE_WEB_CLIENT_ID` / `_SECRET` set on the backend host —
        without these "Connect Google Drive" 500s in production even though
        it may have worked in dev.
  - [ ] Both Google Cloud OAuth clients' consent screens are published
        "In production", not "Testing" (Testing silently expires refresh
        tokens after 7 days).
  - [ ] `.github/workflows/backup.yml`'s repo secrets set: `DATABASE_URL`
        (the **production** database), `GOOGLE_DRIVE_CLIENT_ID/_SECRET/_REFRESH_TOKEN/_BACKUP_FOLDER_ID`
        (bootstrap path), and `GOOGLE_DRIVE_WEB_CLIENT_ID/_SECRET` too if an
        admin has connected (or will connect) via the panel — that job shares
        the production database, so once a `DriveCredential` row exists there
        it needs the matching client credentials to redeem it.
  - [ ] After first deploy: sign in as ADMIN, open the Backups page, confirm
        "Connect Google Drive" completes and a manual "Back up now" succeeds.
