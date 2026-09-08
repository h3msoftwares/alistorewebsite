# Security operations: secrets, backups, admin handoff (S5)

Operational runbook for whoever owns the deployment. Ali's Store is a small
two-tier app (Next.js frontend, Express/Prisma API, one PostgreSQL database);
this is scaled accordingly — no HSM, no secret-manager assumed, but every item
below should have a named owner.

---

## 1. Secret inventory

All backend secrets are environment variables (`backend/.env` in dev; the
host's env/secret store in prod). **Nothing secret is in the repo** — `.env` is
gitignored, only `.env.example` (placeholders) is tracked.

| Secret | What it protects | Blast radius if leaked | Rotatable without downtime? |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | Signs/verifies access tokens | Attacker can mint any user/role token | **No** — see §2.1 |
| `JWT_REFRESH_SECRET` | Signs/verifies refresh tokens | Attacker can mint refresh tokens (but they're also DB-checked, so only alongside a DB write) | **No** — see §2.1 |
| `DATABASE_URL` | Full DB access (all PII, order history, password *hashes*) | Total data compromise | Yes — rotate DB password, update var, redeploy |
| `SEED_ADMIN_PASSWORD` | Initial admin login (seed only) | First admin account | Should be **unset** in prod after first boot; rotate via §4 |
| `SMTP_PASSWORD` | Outbound mail account | Spoofed mail from the store's address | Yes — rotate at provider, update var |
| `HCAPTCHA_SECRET` | Server-side captcha verification | Bot gate at checkout becomes bypassable | Yes — new key pair at hCaptcha, update both tiers |
| `VAPID_PRIVATE_KEY` | Signs Web Push messages | Attacker can push notifications to subscribed admin browsers | Yes — new pair; existing subscriptions must re-subscribe |
| `IMAGEKIT_PRIVATE_KEY` | Signs upload tokens for the ImageKit account | Attacker can upload/transform in the account | Yes — regenerate in ImageKit dashboard |
| `GA4_SA_PRIVATE_KEY` | Google service-account key for the analytics dashboard reads | Read access to the GA4 property | Yes — new key in Google Cloud IAM |

Frontend `NEXT_PUBLIC_*` values are **not secret** (they ship to the browser):
API URL, GA4 measurement id, ImageKit endpoint + *public* key, hCaptcha *site*
key, VAPID *public* key.

## 2. Rotation plan

### 2.1 JWT secrets — quarterly, and immediately on suspected compromise

The app verifies with a single secret, so rotating it **invalidates every
active session** (all access + refresh tokens fail). That is acceptable for
this size — users simply log in again.

Procedure:
1. Generate: `openssl rand -hex 32` (must be ≥ 32 chars; production boot rejects
   placeholders and a shared access==refresh value).
2. Set the new `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` in the host env.
3. Redeploy the backend.
4. (Optional, clean) `DELETE FROM refreshtoken;` — they're all dead anyway.
5. Announce "you'll need to sign in again" if the store has staff/customers
   mid-session.

> If zero-downtime rotation is ever needed, move to a 2-key scheme (accept
> either `_CURRENT` or `_PREVIOUS` on verify, sign with `_CURRENT`) and retire
> `_PREVIOUS` after one refresh-TTL window. Not implemented today.

**Cadence:** every 90 days, plus immediately if a secret may have leaked (repo
exposure, laptop loss, ex-staff with prod access).

### 2.2 Everything else — semi-annually, or on staff offboarding

`DATABASE_URL`, `SMTP_PASSWORD`, `HCAPTCHA_SECRET`, `VAPID_*`,
`IMAGEKIT_PRIVATE_KEY`, `GA4_SA_PRIVATE_KEY`: rotate at the provider, update the
env var, redeploy. Each is independent and causes no session loss. Do all of
them whenever someone with production access leaves.

### 2.3 Rotation log

Keep a simple table (wiki / `security/rotation-log.md`, **not** committed with
values): `secret | rotated on | by whom | reason`. Six months of history is
enough.

## 3. Backups & verification

**What to back up:** the PostgreSQL database is the only stateful component
(product images live in ImageKit; both are recreatable from the DB URLs).

**Recommended:**
- Automated daily `pg_dump` (managed-Postgres providers do this — enable
  point-in-time recovery if offered).
- Retain 7 daily + 4 weekly.
- Store off the DB host (provider's backup bucket, or a separate object store).

**Verification — the part that's usually skipped:**
1. **Monthly restore drill.** Restore the latest dump into a scratch database
   (`createdb alistore_restore_test && pg_restore -d alistore_restore_test <dump>`).
2. Point a local backend at it (`DATABASE_URL=…alistore_restore_test`) and run
   `npx prisma migrate status` — expect "up to date".
3. Smoke check: `SELECT count(*) FROM "user"`, `"order"`, `"product"` return
   sane numbers; load the storefront against it and place a test order.
4. Record the drill result (date, dump age, restore time, pass/fail) in the
   same log as §2.3.
5. A backup that has never been restored is not a backup — a failed drill is a
   P1.

**Also:** after every schema migration in production, take an out-of-band dump
*before* running `migrate deploy`, so a bad migration has a rollback point.

## 4. Admin-credential handoff

The store has one or more `ADMIN` / `STAFF` users in the `User` table.
There is no self-service "invite an admin" UI yet — accounts are created by
seed or direct DB write.

### Creating the first admin (fresh deploy)
1. Set `SEED_ADMIN_PASSWORD` to a strong value **for the seed run only**.
2. Run the seed. It creates the admin with that password (Argon2-hashed).
3. **Unset `SEED_ADMIN_PASSWORD`** and redeploy — it's not read after seeding
   and shouldn't linger in the env.
4. First real action: sign in at the admin door and change the password
   (`/account` → change password), which also invalidates the seed session.

### Adding another STAFF/ADMIN later
Until an invite flow exists, do it deliberately:
1. Create the row with a **random** temporary password:
   `INSERT INTO "user" (id, name, email, "passwordHash", role, "emailVerified", "isActive") …`
   with `passwordHash` = an Argon2 hash of a random string (generate with a
   one-off `node` script using the app's `argon2`), `role='STAFF'`,
   `emailVerified = now()`.
2. Send the person the temp password over a **secure channel** (not email in
   the clear — a password manager share, or Signal).
3. Have them sign in and immediately change it. `changePassword` ends the
   handoff session, so the temp password is single-use in practice.
4. Record: who, what role, granted by whom, date.

### Offboarding
1. `UPDATE "user" SET "isActive" = false WHERE email = …;` — this alone blocks
   login and refresh immediately.
2. `UPDATE "refreshtoken" SET "revokedAt" = now() WHERE "userID" = …;` — kills
   any live session now, not in ≤ 15 min.
3. Rotate any shared prod secrets the person had access to (§2.2).
4. Remove their access to the host, the DB, GitHub, ImageKit, the mail
   provider, and the hCaptcha/GA dashboards.

### Break-glass (locked out of the only admin)
The per-account lock is a column, not a separate store:
`UPDATE "user" SET "lockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE email = …;`
To reset the password directly, replace `passwordHash` with a fresh Argon2 hash
(one-off `node` script) and null out `lockedUntil`.

## 5. Standing operational gaps (from S8)

- **No alerting** on the audit log — a brute-force run is only visible if
  someone queries `auditlog`. Minimum viable: a daily cron that counts
  `admin_login.invalid_credentials` + `step_up.invalid` in the last 24 h and
  emails if over a threshold.
- **Rate limits are per-instance / in-memory** — they reset on deploy and don't
  coordinate across instances. Single-instance today; a Redis-backed store is
  needed before scaling out.
- **No automated dependency updates** — add Dependabot/Renovate, and re-run
  `npm audit` on both packages before each release. Currently one open
  advisory: `deepmerge-ts` via the Prisma CLI (dev-only, non-attacker-reachable
  — see `security/owasp-top-10.md` A06).
- **No centralised log retention** — application logs are whatever the host
  keeps. Decide a retention window and ship `auditlog` somewhere durable.
