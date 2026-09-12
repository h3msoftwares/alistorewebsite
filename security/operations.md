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
| `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth client for the backup tool (§3) | Alone, useless — token exchange also needs the refresh token | Yes — regenerate in Google Cloud Console |
| `GOOGLE_DRIVE_REFRESH_TOKEN` (or the `DriveCredential` DB row, if connected via the admin panel — see §3) | Long-lived Drive access for `modules/backup` (scope `drive.file` — files this app created only) | Attacker can read/delete this app's own Drive backups; cannot browse the rest of the Drive account | Yes — the admin panel's "Disconnect" + "Connect Google Drive", or `npm run backup:token`; either way the old token is revoked at Google |

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
`IMAGEKIT_PRIVATE_KEY`, `GA4_SA_PRIVATE_KEY`, `GOOGLE_DRIVE_CLIENT_SECRET`,
`GOOGLE_DRIVE_REFRESH_TOKEN`: rotate at the provider, update the env var,
redeploy (and update the GitHub Actions repository secret for the last two, so
the scheduled backup keeps working). Each is independent and causes no session
loss. Do all of them whenever someone with production access leaves.

### 2.3 Rotation log

Keep a simple table (wiki / `security/rotation-log.md`, **not** committed with
values): `secret | rotated on | by whom | reason`. Six months of history is
enough.

## 3. Backups & verification

**What's backed up:** the PostgreSQL database — the only stateful component
(product images live in ImageKit; both are recreatable from the DB URLs). A
`pg_dump --format=custom` (compressed, restorable with `pg_restore`) uploaded
to a Google Drive folder. Implementation: `backend/src/modules/backup/`
(`pg-dump.ts`, `drive.client.ts`, `retention.ts`, `backup.service.ts`).

**Schedule:** `.github/workflows/backup.yml` — daily cron (03:00 UTC) plus a
manual `workflow_dispatch` trigger from the Actions tab. Both invoke
`npm run backup:run` (`backend/scripts/run-backup.ts`), which calls the exact
same `runBackup()` used by the admin-triggered path below — one implementation,
two triggers.

**On-demand:** ADMIN-only (not STAFF — see `backup.routes.ts`) from the admin
panel's **Backups** page, or directly: `POST /api/admin/backup` runs a backup
now; `GET /api/admin/backup` lists what's on Drive. The manual trigger is
rate-limited (5/15min/IP) and every trigger — success or failure — is written
to `AuditLog` (`entityType: 'Backup'`, actor = the admin who clicked it).

**Retention:** rolling — the newest `BACKUP_RETENTION_COUNT` dumps are kept on
Drive (default 7, one knob, not a secret); older ones are deleted after each
successful upload (`retention.ts`'s `selectForDeletion`, unit-tested). Only
files matching this tool's own naming pattern
(`alistore-YYYYMMDD-HHMMSS-xxxxxxxx.dump`) are ever touched, so anything else
a human puts in the same Drive folder is left alone.

**Where credentials/folder access live:** `GOOGLE_DRIVE_CLIENT_ID` /
`_CLIENT_SECRET` / `_BACKUP_FOLDER_ID` — env vars locally (`backend/.env`,
gitignored), GitHub Actions repository secrets for the scheduled workflow,
and the host's env/secret store in production. The OAuth client is a Google
Cloud "Desktop app" credential scoped to `drive.file openid email` (this
app's own Drive files only, not the whole account; `openid email` is only so
the admin panel can show "Connected as x@gmail.com"). **The Cloud project's
OAuth consent screen must be published "In production"** — left in
"Testing", Google silently expires the refresh token after 7 days and
backups start failing with no warning until someone checks.

The refresh token itself (`_REFRESH_TOKEN`) has two sources, and the
`DriveCredential` DB row takes priority once it exists at all:
- **Admin panel** (`/admin/backup` → "Connect Google Drive") — the normal
  path. Clicking it sends the browser to Google's consent screen and back to
  `GET /api/admin/backup/drive/callback`; the resulting refresh token is
  stored in the `DriveCredential` table, not an env var. "Disconnect" revokes
  it at Google and clears that row — once the row exists (even cleared), the
  `GOOGLE_DRIVE_REFRESH_TOKEN` env var below is ignored entirely, so
  Disconnect actually disconnects.
- **`GOOGLE_DRIVE_REFRESH_TOKEN` env var** — the original bootstrap path,
  minted once via `npm run backup:token` (two-step CLI script — only a human
  with the Drive account's Google login can complete this, it can't be
  automated). Still the only option for the GitHub Actions secret (that job
  can't click a browser button), and the fallback for a fresh install where
  no admin has connected via the panel yet.

Google Cloud Console setup for the panel's "Connect" button: the OAuth
client needs `${BACKEND_URL}/api/admin/backup/drive/callback` added as an
**Authorized redirect URI**, alongside the existing `http://localhost` (the
CLI script's redirect_uri — keep both, don't replace one with the other).
`BACKEND_URL` is this API's own public URL (`http://localhost:4000` in dev);
set it to the real backend URL in production and register the matching
callback there too.

**Restoring into the live database (admin panel):** the Backups page has a
"Restore" button per file — this is the emergency-recovery path, not the
drill (below). Deliberately heavy, on purpose:
- ADMIN only, same as the rest of this feature.
- Step-up re-auth (`requireFreshAuth`) — a session idle longer than
  `STEP_UP_FRESHNESS_MIN` (10 min default) is refused even for an ADMIN. The
  dialog always asks for the password up front (re-entering it is the
  confirmation itself — no separate "type the filename" step) and calls
  `POST /api/auth/step-up` before the restore either way, so it works the
  same regardless of whether the session already happened to be fresh.
- Tightly rate-limited (3/15min) and every attempt — success or failure — is
  audit-logged (`backup.restore` / `backup.restore.failed`).
- The chosen dump is validated (`pg_restore --list`) before anything is
  touched, and the restore itself runs as one transaction
  (`--single-transaction --exit-on-error`) — a bad/corrupt file, or a restore
  that fails partway, leaves the current data exactly as it was.

**Restore drill procedure** (monthly, into a scratch database — never the
live one; do this even when nothing's wrong, a backup that's never been
restored is not a backup):
1. Download the dump from the Drive folder (or use a local one, if `PG_DUMP_BIN`
   was just run) — a `.dump` file, `pg_restore --format=custom`.
2. Create a scratch database: `createdb alistore_restore_test` (or
   `CREATE DATABASE alistore_restore_test OWNER alistore;` via `psql`).
3. Restore: `pg_restore --dbname=<scratch DB URL> --no-owner --no-privileges
   --clean --if-exists <dump file>`.
4. Point a local backend at it (`DATABASE_URL=…alistore_restore_test`) and run
   `npx prisma migrate status` — expect "up to date".
5. Smoke check: row counts for `"user"`, `"product"`, `"auditlog"` match the
   source database; load the storefront against it and place a test order.
6. Record the drill result (date, dump age, restore time, pass/fail) in the
   same log as §2.3. A failed drill is a P1.
7. Drop the scratch database when done.

**Also:** after every schema migration in production, trigger an out-of-band
backup (`POST /api/admin/backup`) *before* running `migrate deploy`, so a bad
migration has a rollback point.

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
