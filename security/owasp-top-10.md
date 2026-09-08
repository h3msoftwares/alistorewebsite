# OWASP Top 10 (2021) — coverage map (S8)

State after the S1–S9 security track. Each category lists **what's covered and
where**, then **gaps / residual risk**. Paths are `backend/src` unless noted.

---

## A01:2021 — Broken Access Control

**Covered**
- Every privileged route sits behind `requireAuth` + `requireRole('STAFF','ADMIN')`.
  The admin router applies it once at the top (`modules/admin/admin.routes.ts`);
  the catalog / discounts / settings / uploads routers apply an `admin` guard
  array per mutating route. The client never asserts its own role — it's read
  from the verified JWT (`middleware/rbac.middleware.ts`).
- Role is also re-checked server-side inside the admin-login service *after*
  password verify, and privileged accounts are refused at the customer login
  door entirely (`auth.service.ts`).
- **IDOR**: order reads/cancels are scoped to `req.user.id`
  (`order.service.ts`); a guest `addressId` is rejected outright at checkout so
  another user's saved address can't be referenced; guest order access is via a
  256-bit `OrderAccessToken`, not a guessable id.
- **Step-up (S2)**: order-status changes and stock edits additionally require a
  password re-entry within 10 min (`middleware/step-up.middleware.ts`).
- **STAFF vs ADMIN tier (S4)**: `requireRole('ADMIN')` narrows STAFF out of the
  irreversible / financial routes — permanent deletes (products / collections /
  categories), `PATCH /api/settings`, every discount & coupon write, and the
  revenue reports (`/api/admin/dashboard`, `/api/admin/analytics/{sales,customers}`).
  Everything else stays STAFF+ADMIN. Covered by `admin-role-boundary.test.ts`
  (STAFF→403 / ADMIN→200 on every gated route).
- **CSRF** (an access-control failure): **signed** double-submit cookie
  (`value.HMAC`, key from `JWT_ACCESS_SECRET`) + matching `X-CSRF-Token`
  header, timing-safe compare, on every non-GET
  (`middleware/csrf.middleware.ts`). Signed (not plain) so a cookie an
  attacker *plants* can't produce a valid MAC — pentest H2.
- Frontend `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on both tiers
  (clickjacking).

**Gaps / residual risk**
- The S4 tier is coarse (two roles, one gate). There is still no **staff-account
  management** surface (no invite/disable UI or API) — admins are provisioned by
  seed or direct DB write (see `security/operations.md` §4).
- `express-rate-limit` counters are per-instance and in-memory.

---

## A02:2021 — Cryptographic Failures

**Covered**
- Passwords: **Argon2id** (`auth.service.ts`). Never logged, never returned.
- Access tokens: **HS256, algorithm pinned** on verify (no `alg:none` /
  downgrade). Short TTL (5 min admin / 15 min customer), memory-only on the
  client. Verify also enforces a `maxAge: 1h` ceiling and **rejects a token
  with no `exp`** — a token can't be minted immortal even if the secret
  leaks (pentest V3).
- Refresh tokens: random JWT, stored **sha256-hashed** — a DB dump can't be
  replayed. `httpOnly` + `SameSite=Strict` + `Secure` (prod) + `Path=/api/auth`.
- Reset / verification / order-access / OTP tokens: all stored **hashed**, all
  time-boxed.
- Secrets: `min(32)` length always; production boot **refuses to start** on a
  placeholder secret, a shared access/refresh secret, or the hCaptcha test
  secret (`config/env.ts`).
- Transport: **HSTS** (`max-age` 2 y, `includeSubDomains`, `preload`) on the
  API (prod) and the frontend; `upgrade-insecure-requests` in the frontend CSP
  (prod).
- No card data is ever collected or stored (Cash on Delivery only).

**Gaps / residual risk**
- TLS termination / cert management is deployment-infra responsibility (see
  `security/operations.md`).
- No field-level encryption of PII at rest (delivery name / phone / address are
  plaintext columns) — accepted for this data class; DB-level encryption is a
  hosting concern.

---

## A03:2021 — Injection

**Covered**
- **SQL**: 100% Prisma / `Prisma.sql` tagged templates — every query
  parameterised. No string-built SQL anywhere. The input sanitiser
  *deliberately does not* blocklist SQL keywords (would only break real data
  like `O'Brien`).
- **XSS**: React output-encodes by default; **zero `dangerouslySetInnerHTML`**,
  **zero `eval` / `new Function`** in the frontend. The global sanitiser
  (`middleware/sanitize.middleware.ts`) rejects HTML-tag syntax in any body /
  query string, strips control chars, and drops prototype-pollution keys.
  Admin-controlled URLs (social links, store map links) pass an http(s)-only
  allowlist before being rendered as `<a href>` (`safe-url.ts`,
  `site-footer.tsx`). The transactional **emails** (the one place raw HTML is
  assembled server-side) now escape every customer field on output via
  `esc()` in `lib/mailer.ts` — output encoding, not the input denylist, is
  the control there (pentest H1; `tests/unit/mailer-escaping.test.ts`).
- **CSP** (frontend): restrictive baseline — `default-src 'self'`,
  `object-src 'none'`, no `frame-ancestors`, form posts to self only. Two
  documented relaxations (`'unsafe-inline'` for `script-src` / `style-src`);
  see `frontend/next.config.mjs`.
- **Command injection**: no `child_process` / shell execution in the request
  path.
- Every route validates `body` / `query` / `params` with Zod
  (`middleware/validate.middleware.ts`).

**Gaps / residual risk**
- `'unsafe-inline'` in the frontend `script-src` is the notable relaxation.
  Upgrading to a nonce + `strict-dynamic` CSP needs `proxy.ts` + forced dynamic
  rendering (would defeat static generation of the storefront) — deferred, not
  blocking.

---

## A04:2021 — Insecure Design

**Covered**
- CoD-only by design: no payment-card attack surface at all.
- Checkout is defence-in-depth: hCaptcha → email OTP → PHONE/EMAIL/IP blocklist
  → order-velocity soft-flag for manual review. Guest tracking is a
  capability-URL (unguessable token), not an id.
- **Stock claim is race-safe** (pentest V1): checkout decrements with an
  atomic guarded `UPDATE … WHERE stockQuantity >= qty`, backed by a DB
  `CHECK (stockQuantity >= 0)`. No oversell under concurrency.
- **Coupons have usage caps** (pentest V2b): `maxRedemptions` (global,
  enforced by an atomic guarded increment) and `maxPerCustomer`; every
  redemption is recorded in `CouponRedemption`. `POST /api/coupons/validate`
  is rate-limited so codes can't be enumerated.
- Enumeration-safe by design: registration, login, forgot-password and
  order-lookup all return uniform responses and run constant-ish work on every
  branch.
- Session-fixation mitigation (**S9**): the guest cart id is **rotated** on
  login, not merely cleared.
- Step-up auth (**S2**) is a design-level control: "valid session" and
  "recently proved they know the password" are treated as different trust
  levels.

**Gaps / residual risk**
- No account-level anomaly detection (e.g. "login from a new country") — out of
  scope for this size.
- Order-velocity thresholds are heuristic; a determined abuser who paces
  requests can stay under them (accepted — CoD limits the payoff).

---

## A05:2021 — Security Misconfiguration

**Covered**
- **`helmet`** on the API: CSP `default-src 'none'` (it serves only JSON),
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`,
  `X-Permitted-Cross-Domain-Policies: none`, `X-DNS-Prefetch-Control: off`,
  `X-Powered-By` removed, HSTS (prod). The one relaxation —
  `Cross-Origin-Resource-Policy: cross-origin` — is deliberate and documented
  (`app.ts`): the SPA is a different origin and must read the responses; CORS
  still governs *which* origin.
- **Frontend** (`next.config.mjs`): full CSP, HSTS, `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  (camera/mic/geo/payment/usb/interest-cohort all denied), `X-Frame-Options:
  DENY`, `poweredByHeader: false`.
- CORS is an **exact-match allowlist** with `credentials: true` (`CORS_ORIGIN`),
  applied via a per-request delegate so a non-allowlisted origin gets **no**
  `Access-Control-*` headers at all (pentest H3).
- `trust proxy` is `1` in production only — a spoofed `X-Forwarded-For` can't
  move `req.ip` in dev/test.
- Errors return a clean envelope; body-parser errors don't echo raw messages
  and don't spam logs; unexpected errors return a generic 500
  (`middleware/errorHandler.middleware.ts`).
- Production boot-time assertions on secrets and the hCaptcha secret.
- `/health` is bare — no rate limit, no `Set-Cookie`.

**Gaps / residual risk**
- Dependency-update cadence isn't automated (no Dependabot/Renovate config in
  repo) — see `security/operations.md`.
- No automated header regression check in CI.

---

## A06:2021 — Vulnerable and Outdated Components

**Covered**
- `npm audit` run on both packages during this track:
  - **frontend — 0 vulnerabilities.**
  - **backend — 3 HIGH, one chain**: `deepmerge-ts <8` (stack exhaustion on
    recursive object graphs) pulled in transitively by the **`prisma` CLI** and
    `@prisma/config`. `deepmerge-ts@8` (the fix) is only required by Prisma 8,
    which is currently a **release candidate**. `npm audit fix --force` would
    *downgrade* to `prisma@6.12.0` (breaking, pre-`@prisma/config`).
    **Decision: documented, not forced** — the affected code runs only in the
    Prisma CLI on a dev/CI machine merging Prisma's own config, never in the
    request path, and is not attacker-reachable. Re-check when Prisma 8 is
    stable.
- **`web-push`** was investigated (S3): it **is** used — `lib/push.ts` →
  `lib/notifications/notification.service.ts` → checkout / cancellation, for
  admin browser push alerts on new/cancelled orders, gated on VAPID keys. It is
  a real feature with its own model (`PushSubscription`) and routes
  (`/api/admin/push-subscriptions`). **Kept.**

**Gaps / residual risk**
- The `deepmerge-ts` advisory stays open until Prisma 8 stable. Low real risk
  (dev-only, non-attacker-controlled input).
- No lockfile-integrity / provenance checks in CI.

---

## A07:2021 — Identification and Authentication Failures

**Covered** — see `security/auth-model.md` for the full model. Highlights:
- Argon2id; per-account lockout (5 tries → 15 min / 30 min admin); uniform
  "invalid credentials"; separate unguessable admin door with a tighter
  (5 / 15 min) rate limit.
- Refresh-token **rotation + family reuse-detection** — a replayed refresh
  token revokes the whole session family.
- Email-verification required before first sign-in.
- `changePassword` ends every other session.
- Step-up re-auth (**S2**) for sensitive actions.
- Access tokens are memory-only; refresh cookie is `httpOnly` + `SameSite=Strict`.

**Gaps / residual risk**
- No MFA/TOTP for admins (single-factor password + rate-limit + lockout).
  Reasonable next hardening step if the store grows.
- No password-strength meter / breached-password check on the client (server
  enforces length bounds only).
- Rate-limit state is per-instance / in-memory.

---

## A08:2021 — Software and Data Integrity Failures

**Covered**
- JWT algorithm is **pinned** on every verify — no `alg` confusion.
- Refresh tokens are hashed at rest and rotation-tracked; a replay is detected
  and the family revoked.
- Prototype-pollution keys (`__proto__`, `constructor`, `prototype`) are
  stripped from every request object (`sanitize.middleware.ts`).
- Prisma migrations are checked into VCS; `migrate deploy` (not `db push`) is
  the deploy path.
- Frontend third-party scripts are a **fixed allowlist** in the CSP
  (`googletagmanager`, `hcaptcha`); nothing else can load.

**Gaps / residual risk**
- No Subresource Integrity (SRI) on the GA / hCaptcha `<script>` tags (both are
  versionless vendor endpoints where SRI isn't practical) — mitigated by the
  CSP host allowlist.
- CI/CD pipeline integrity (signed commits, protected branches, build
  provenance) is a GitHub-settings concern, not in this repo.

---

## A09:2021 — Security Logging and Monitoring Failures

**Covered**
- Append-only `AuditLog` for: every customer + admin login attempt (with
  outcome, IP, user-agent), every step-up attempt, and every admin
  order-status / cancellation / flag mutation. Indexed on entity, actor, and
  time. See `security/auth-model.md` §7.
- Best-effort writes — logging can't fail the action, but a swallowed write is
  `console.error`-ed.
- Rate-limit hits return `429` with `RateLimit-*` headers (observable at the
  edge).

**Gaps / residual risk**
- **No alerting** — the audit log is queryable but nothing watches it. A
  brute-force run shows up only if someone looks.
- **Coverage gaps** (§7): product/collection/category CRUD, blacklist changes,
  settings changes, and push-subscription changes are **not** audited.
- No centralised log shipping / retention policy (see
  `security/operations.md`).
- No request-id correlation between the audit row and app logs.

---

## A10:2021 — Server-Side Request Forgery (SSRF)

**Covered**
- The backend makes exactly one class of outbound HTTP call from the request
  path: **hCaptcha verification** to a hard-coded `hcaptcha.com` endpoint
  (`checkout-otp.service.ts` / `verifyCaptcha`). No user-supplied URL is ever
  fetched server-side.
- Image uploads go **direct browser → ImageKit** using a short-lived signed
  token; the backend never fetches the image.
- Admin-supplied URLs (social links, store map links) are **stored and rendered
  only** — never fetched by the server — and pass an http(s)-only allowlist.
- `web-push` sends to push endpoints supplied by the browser's Push API at
  subscribe time; role is re-checked at send, dead endpoints (404/410) are
  pruned. Not a user-controlled-URL fetch in the classic SSRF sense.

**Gaps / residual risk**
- If a future feature fetches a user- or admin-supplied URL server-side (webhook
  callbacks, "import from URL", link previews), it must go through an allowlist
  + private-IP block. None exists today.
