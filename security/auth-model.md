# Authentication, sessions, rate limits & audit logging (S7)

Reflects the code as of the S1–S9 security track. File references are to `backend/src`.

---

## 1. Password storage

- **Argon2id** via the `argon2` package, default parameters (`auth.service.ts`,
  `admin-auth.service.ts`). Hashes are stored in `User.passwordHash`; the plain
  password never leaves the request handler.
- A fixed **dummy hash** (`DUMMY_HASH`) is verified on every login attempt that
  matches no usable account, so response timing does not reveal whether an
  email/phone exists. The customer and admin doors share it, so both pay the
  same Argon2 cost.
- Registration always runs an Argon2 hash on the submitted password regardless
  of which branch executes, for the same timing reason.

## 2. Tokens

| Token | Lifetime | Where it lives | Purpose |
| --- | --- | --- | --- |
| **Access JWT** | `JWT_ACCESS_TTL` = **15 min** (CUSTOMER) / `JWT_ADMIN_ACCESS_TTL` = **5 min** (STAFF, ADMIN) | Browser memory only (never `localStorage`, never a cookie) | Bearer auth on every API call. TTL is chosen by **role**, so a privileged account always gets the short TTL — including on silent refresh, which re-signs with the account's current role. |
| **Refresh JWT** | `JWT_REFRESH_TTL_DAYS` = **30 days** | `refreshToken` cookie — `httpOnly`, `SameSite=Strict`, `Secure` in production, `Path=/api/auth` | Exchanged for a new access token by `POST /api/auth/refresh` only. Stored **hashed** (`sha256`) in `RefreshToken`, so a DB leak alone can't be replayed. |
| **CSRF token** | per session | `csrfToken` cookie — **not** `httpOnly` (the SPA reads it), `SameSite=Strict` | **Signed** double-submit: cookie value is `<random>.<HMAC(key, random)>` (key derived from `JWT_ACCESS_SECRET`). Every state-changing request must echo the exact cookie value in `X-CSRF-Token` (timing-safe compare) AND that value's HMAC must verify — a planted / attacker-chosen cookie is rejected. |
| **Guest cart id** | 30 days | `cartSession` cookie — `httpOnly`, `SameSite=Strict`, `Secure` in production, `Path=/` | Anonymous cart ownership. **Rotated** on login (S9). |
| **OrderAccessToken** | issued per guest order | emailed link only; stored hashed | Lets a guest view/cancel their own order without an account. |

### Access-token claims

`{ id, role, auth_time, iat, exp }` — HS256, algorithm pinned on verify (`auth.middleware.ts`).
`auth_time` (unix seconds) is **when a password was last verified** for this
login. It is set at login / admin-login / change-password / step-up, and is
**carried unchanged through every silent refresh** — see §4.

## 3. Refresh-token rotation & reuse detection (`auth.service.ts` `refresh()`)

- Every refresh **rotates**: the presented token is revoked and a successor is
  issued in the same `familyID` chain.
- Presenting an already-rotated or revoked token = **replay**. The whole family
  is revoked and the caller is rejected — one stolen refresh token can't
  outlive its legitimate use.
- `changePassword()` revokes **every** live refresh token for the account (a
  credential change ends all other sessions), then issues a fresh pair for the
  calling browser.

## 4. Step-up auth (S2) — `middleware/step-up.middleware.ts`

Some actions need more than "a valid session": the caller must have **entered
their password recently**. Because the access token silently refreshes, its
`iat` is never more than a few minutes old — useless as a freshness signal. So:

- `RefreshToken.authTime` stores the password-entry moment. A fresh login /
  admin-login / `POST /api/auth/step-up` sets it to *now*; a rotation copies
  the parent's value forward **unchanged**.
- The access token carries that value as the `auth_time` claim.
- `requireFreshAuth(maxAgeSeconds = STEP_UP_FRESHNESS_MIN·60)` rejects when
  `now - auth_time > maxAge` (or the claim is absent) with
  **`STEP_UP_REQUIRED` → HTTP 403** (not 401 — a 401 would make the SPA
  silently refresh, which cannot help).

**Freshness window: `STEP_UP_FRESHNESS_MIN` = 10 minutes** (env-overridable).
Rationale: ≈ one working "sitting" — long enough that an admin working through a
batch of orders types their password roughly once, not once per action; short
enough that a walked-away or hijacked session goes stale before much damage. It
is 2× the admin access-token TTL (so it is meaningfully longer than "just
refreshed") and ⅓ of the 30-minute admin lockout window.

**Protected routes (only these):**
- `PATCH /api/admin/orders/:id/status`
- `PATCH /api/admin/variants/:variantId/stock`

**Unlock flow:** the SPA catches `STEP_UP_REQUIRED`, prompts for the password,
calls `POST /api/auth/step-up { password }` (requires the current session),
swaps in the returned token, and retries. Step-up starts a **new refresh
family** with a fresh `authTime` and does **not** revoke other sessions — it is
a re-auth prompt, not a logout.

## 5. Login hardening (customer `login()` / admin `adminLogin()`)

- **Per-account lockout** on the shared `User` row: 5 failed attempts →
  15-minute lock (customer) / 30-minute lock (admin). A standing lock rejects
  without advancing the counter.
- **Uniform rejection**: unknown identifier, wrong password, locked-out, and
  wrong-door-for-role all return the same `UNAUTHORIZED / "Invalid credentials"`.
- **Role separation**: privileged accounts are refused at the customer door
  (`POST /api/auth/login`) outright — they have exactly one door,
  `POST /api/auth/ali-admin-login` (deliberately unguessable path, tighter rate
  limit, audited). Refusing here also stops the looser public endpoint being
  used to drive a privileged account's lockout counter.
- **Email-verification gate**: an unverified customer with the right password
  gets a specific "verify your email" message (they've already proven the
  password, so it reveals nothing).

## 5b. Role tiers — STAFF vs ADMIN (S4)

Two privileged roles. The default gate on every admin / catalog-write route is
`requireRole('STAFF', 'ADMIN')`. A second `requireRole('ADMIN')` narrows STAFF
out of the routes where a mistake is irreversible or the data is financial:

| ADMIN-only route | Why |
| --- | --- |
| `DELETE /api/products/:id/permanent`, `…/collections/:id/permanent`, `…/categories/:id/permanent` | Irreversible hard delete. The soft delete / archive (`DELETE /:id`) stays STAFF. |
| `PATCH /api/settings` | Delivery-fee config, brand identity, store locations, storefront-wide social links. |
| `POST` / `PATCH` / `DELETE` on `/api/discounts` and `/api/coupons` | Changes what the store charges. **Reads** (`GET`) stay STAFF; `POST /api/coupons/validate` stays public. |
| `GET /api/admin/dashboard`, `GET /api/admin/analytics/sales`, `GET /api/admin/analytics/customers` | Revenue / customer-value data. The operational reports (`overview`, `inventory`, `products`, `visitors`, `funnel`) stay STAFF. |

Everything else — order fulfilment (`/status` (also step-up), `/collected`,
`/review`), order listing, catalog CRUD + archive/restore, blacklist,
image-upload auth, push subscriptions — stays STAFF+ADMIN. A STAFF token on an
ADMIN-only route gets `FORBIDDEN` (403). Covered by
`tests/integration/admin-role-boundary.test.ts`.

There is **no staff-account management API/UI** yet — STAFF/ADMIN users are
created by seed or direct DB write (`security/operations.md` §4).

## 6. Rate limits (per endpoint)

`express-rate-limit`, in-memory, per-IP unless noted. All windows are **15
minutes** except the app-wide baseline. Every limiter is on in dev/prod and off
under `NODE_ENV=test` (a focused test re-enables the one it exercises).

| Endpoint | Limit | Key |
| --- | --- | --- |
| _app-wide baseline_ | 300 / **1 min** | IP |
| `POST /api/auth/login` | 10 | IP |
| `POST /api/auth/register` | 10 | IP |
| `POST /api/auth/register` | 3 | email |
| `POST /api/auth/ali-admin-login` | **5** | IP |
| `POST /api/auth/change-password` | 10 | IP |
| `POST /api/auth/step-up` | 10 | IP |
| `POST /api/auth/forgot-password` | 10 | IP |
| `POST /api/auth/forgot-password` | 3 | email |
| `POST /api/auth/reset-password` | 10 | IP |
| `POST /api/auth/verify-email` | 10 | IP |
| `POST /api/auth/resend-verification` | 10 | IP |
| `POST /api/auth/resend-verification` | 3 | email |
| `POST /api/checkout/otp/verify` | 20 | IP |
| `POST /api/coupons/validate` | 20 | IP |
| `GET /api/orders/track/:token` | 10 | IP |
| `POST /api/orders/lookup` | 10 | IP |
| `POST /api/orders/lookup` | 3 | order number |

**Checkout OTP request** (`POST /api/checkout/otp/request`) is rate-limited in
the **database**, not by `express-rate-limit` (`checkout-otp.service.ts`):
per-email 60 s cooldown, 3 / 15 min; per-IP 10 / 15 min; code TTL 5 min. It
also runs the hCaptcha check and the PHONE/EMAIL/IP blocklist first.

> **Production note:** in-memory counters reset on deploy and are per-instance.
> Fine for a single-instance deployment; a multi-instance deployment needs a
> shared store (Redis) — see `security/operations.md`.

## 7. What `AuditLog` records, and why

`AuditLog` (`lib/audit.ts`) is an **append-only** "who did what, when" trail:
`{ entityType, entityID, action, actorID, metadata (JSON), createdAt }`. Writes
are best-effort — a logging failure never fails the action it describes.

| `action` | Written from | Why it's recorded |
| --- | --- | --- |
| `customer_login.success` / `.invalid_credentials` / `.locked_out` / `.privileged_denied` / `.email_unverified` | `auth.service.ts` | Detect credential-stuffing / targeted lockout griefing; know which account & IP. |
| `admin_login.success` / `.invalid_credentials` / `.locked_out` / `.not_admin` | `admin-auth.service.ts` | The highest-value credential surface — every attempt, success or fail, with IP + user-agent. |
| `step_up.success` / `step_up.invalid` | `step-up.controller.ts` | A password re-entry for a sensitive action; a burst of `.invalid` on one session is a hijack signal. |
| `order.status_changed` | `order.service.ts` | Fulfilment-state changes are irreversible for the customer; records actor + from/to. |
| `order.cancelled` | `order.service.ts` | Who cancelled (customer, guest-via-token, or staff) and when. |
| `order.flagged` | `order.service.ts` | Order-velocity heuristic tripped — for manual review. |
| `order.flag_cleared` | `order.service.ts` | A human cleared a flag — closes the review loop. |

`metadata` carries the context that isn't a column: `ip`, `userAgent`,
`identifier`, `outcome`, `from`/`to` status, flag reason. It is indexed on
`(entityType, entityID)`, `actorID`, and `createdAt`.

**Not yet recorded (gaps):** product / collection / category create-update-
delete, blacklist add/remove, settings changes, push-subscription changes. See
`security/pentest-checklist.md`.
