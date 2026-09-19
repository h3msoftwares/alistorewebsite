import { z } from 'zod';

// Loads backend/.env into process.env — every entry point (tsx dev/watch,
// the built dist/server.js, vitest, prisma's seed script) ends up importing
// this module before touching process.env, so wiring it here covers all of
// them at once instead of threading --env-file through each npm script.
// Node's native loader (stable since ~20.12) needs no new dependency; it's
// wrapped in try/catch since CI environments that inject real env vars
// directly won't have a .env file on disk, and that's fine.
// In tests, vitest injects DATABASE_URL / JWT secrets via `test.env` (see
// vitest.config.mts) — don't let a local .env override them onto the dev DB.
try {
  if (process.env.NODE_ENV !== 'test') {
    process.loadEnvFile();
  }
} catch {
  // no .env file present — assume the environment already has these vars
}

// hCaptcha's official, publicly documented test secret — pairs only with the
// dummy passcode `10000000-aaaa-bbbb-cccc-000000000001`; any other token
// genuinely fails verification. Safe to default to in dev/test; refused in
// production (see assertRealCaptchaSecret).
export const HCAPTCHA_TEST_SECRET = '0x0000000000000000000000000000000000000000';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  // Bind address. Default 0.0.0.0 so a PaaS (Railway/Fly) can route to the
  // container. On a VPS behind Nginx, set HOST=127.0.0.1 so Express is not
  // reachable from the internet even if the firewall is misconfigured.
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  // 32 chars is the floor everywhere; production additionally rejects known
  // placeholders and a shared access/refresh secret (see assertStrongSecrets).
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  // Privileged (STAFF/ADMIN) sessions get a shorter access token — see
  // signAccessToken in modules/auth/auth.service.ts.
  JWT_ADMIN_ACCESS_TTL: z.string().default('5m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  // Step-up auth (S2): how recently a password must have been entered for a
  // sensitive admin action (order status change, stock edit). Checked against
  // the access token's `auth_time` claim, which a silent refresh does NOT
  // reset. 10 min ≈ one working "sitting" — long enough not to nag an admin
  // mid-task, short enough that a walked-away / hijacked session goes stale.
  STEP_UP_FRESHNESS_MIN: z.coerce.number().default(10),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // App-wide baseline rate limiter (see app.ts): requests per IP per minute.
  // Per-route auth/checkout buckets layer stricter limits on top. Tunable so
  // ops can raise it to ride out a legitimate traffic spike or lower it to
  // clamp abuse without a redeploy. Default matches the previous hard-coded
  // value, so leaving it unset changes nothing.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  // Password-reset token lifetime, in minutes.
  RESET_TOKEN_TTL_MIN: z.coerce.number().default(30),
  // Email-verification token lifetime, in minutes. Longer than the reset
  // token — a fresh signup may not check their inbox for a while.
  EMAIL_VERIFICATION_TTL_MIN: z.coerce.number().default(1440), // 24h
  // Account email-change confirmation link lifetime, in minutes — an
  // authenticated, deliberate action (unlike signup), so a tighter window
  // than email verification is appropriate.
  EMAIL_CHANGE_TTL_MIN: z.coerce.number().default(60), // 1h
  // Base URL the reset / verification links are built against:
  // `${FRONTEND_URL}/{locale}/reset-password?token=...`
  // `${FRONTEND_URL}/{locale}/verify-email?token=...`
  // `${FRONTEND_URL}/{locale}/confirm-email-change?token=...`
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // ImageKit — signs the admin image uploader's short-lived upload token
  // (see modules/uploads). Defaulted to empty rather than required: the
  // server still boots, the upload-auth endpoint just 503s with a clear
  // "not configured" message instead.
  IMAGEKIT_PRIVATE_KEY: z.string().default(''),

  // Google Analytics 4 Data API — feeds the traffic / visitor / funnel widgets
  // of the admin analytics dashboards. Same "boots without it" pattern: when
  // any of the three is empty the GA4-backed endpoints return
  // `{ configured: false }` and the dashboards show a connect-GA4 empty state.
  // GA4_SA_PRIVATE_KEY is a service-account key; keep the literal "\n"s — the
  // client unescapes them (see modules/analytics/ga.service.ts).
  GA4_PROPERTY_ID: z.string().default(''),
  GA4_SA_CLIENT_EMAIL: z.string().default(''),
  GA4_SA_PRIVATE_KEY: z.string().default(''),

  // Order notifications — who the store owner is alerted at when a new order
  // comes in. Same "boots without it" pattern as IMAGEKIT_PRIVATE_KEY: empty ⇒
  // notification.service.ts skips it (logs and no-ops) instead of failing
  // checkout.
  OWNER_NOTIFICATION_EMAIL: z.string().default(''),

  // hCaptcha — gates POST /api/checkout/otp/request so a bot can't spam OTP
  // emails at addresses it doesn't own. Defaults to hCaptcha's own
  // documented "always fails unless the exact dummy passcode is sent" test
  // secret, so dev/CI work out of the box without a registered site; a real
  // production secret is enforced below (see assertRealCaptchaSecret).
  HCAPTCHA_SECRET: z.string().default(HCAPTCHA_TEST_SECRET),

  // Web Push (admin order-alert notifications). Generate once with
  // `node -e "console.log(require('web-push').generateVAPIDKeys())"` and
  // never rotate casually — doing so invalidates every admin's existing
  // subscription. Same "boots without it" pattern as IMAGEKIT_PRIVATE_KEY: empty ⇒
  // notification.service.ts skips the push channel (logs and no-ops).
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  // A contact URI required by the Web Push protocol (RFC 8292) — sent to the
  // push service so it can reach the sender if this key pair misbehaves.
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

  // Google Drive database backups (modules/backup) — a dependency-free REST
  // OAuth client (no googleapis package), modeled on the H3M backup tool.
  // Same "boots without it" pattern as IMAGEKIT_PRIVATE_KEY: left
  // unset, the backup endpoints 503 with a clear "not configured" message
  // instead of failing to boot.
  //
  // TWO separate Google Cloud OAuth clients, because a "Desktop app" client
  // (below) only supports Google's fixed loopback redirect — it cannot use a
  // custom callback path, so it can't back the admin panel's browser-based
  // "Connect Google Drive" flow:
  //   - GOOGLE_DRIVE_CLIENT_ID/_SECRET: the original "Desktop app" client
  //     (redirect_uri http://localhost). Refresh token minted once via
  //     `npm run backup:token` (backend/scripts/generate-drive-refresh-token.ts)
  //     into GOOGLE_DRIVE_REFRESH_TOKEN — still what GitHub Actions' scheduled
  //     backup uses, and the fallback until an admin connects via the panel.
  //   - GOOGLE_DRIVE_WEB_CLIENT_ID/_SECRET: a "Web application" client whose
  //     Authorized redirect URIs include
  //     `${BACKEND_URL}/api/admin/backup/drive/callback` (see drive.client.ts's
  //     buildAuthUrl/completeConnection). Its refresh tokens are stored in the
  //     `DriveCredential` DB row, not an env var — see getEffectiveCredential.
  // A refresh token must be redeemed with the SAME client id/secret that
  // issued it — Google rejects a mismatched pair — so these two credential
  // pairs are never interchangeable and drive.client.ts tracks which one
  // goes with the currently-active token.
  // Both Cloud project's OAuth consent screen must be published "In
  // production" — left in "Testing", Google silently expires refresh tokens
  // after 7 days.
  GOOGLE_DRIVE_CLIENT_ID: z.string().default(''),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_DRIVE_WEB_CLIENT_ID: z.string().default(''),
  GOOGLE_DRIVE_WEB_CLIENT_SECRET: z.string().default(''),
  // The Drive folder backups are uploaded into, for the env-var/Desktop-
  // client bootstrap path ONLY: create it once in Drive (under the same
  // account backup:token authorized) and paste its id (the segment after
  // /folders/ in the folder's URL). NOT used for an admin-panel "Connect"
  // — a folder id belongs to whichever account created it, so it can't be
  // shared across "connect any Drive account"; that path instead
  // finds-or-creates its own folder per connected account (see
  // drive.client.ts's ensureAppFolder) and stores its id on the
  // DriveCredential row.
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: z.string().default(''),
  // Name of the folder ensureAppFolder finds-or-creates in a newly-connected
  // account. Generic by design — this is a reusable tool, not branded to one
  // client's store name.
  GOOGLE_DRIVE_FOLDER_NAME: z.string().default('Database Backups'),
  // "Connect Gmail account" (modules/mail/gmail.client.ts) — the ONLY way
  // this app sends outgoing mail. Uses the Gmail API (HTTPS) instead of raw
  // SMTP, which Railway's free/hobby tier blocks outright (confirmed live —
  // see docs/DEPLOYMENT.md); until this is connected via the admin Mail
  // page, every send is a logged no-op (see lib/mailer.ts's getTransporter).
  // A SEPARATE Google Cloud OAuth "Web application" client from the Drive
  // one above — its own Google Cloud project, not reused — so the two
  // connections are entirely independent. Same "must be In production, not
  // Testing" trap as Drive's consent screen: left in Testing, Google
  // silently expires the refresh token after 7 days.
  GMAIL_SEND_CLIENT_ID: z.string().default(''),
  GMAIL_SEND_CLIENT_SECRET: z.string().default(''),
  // Rolling retention: how many of this tool's own dumps to keep on Drive:
  // after each successful upload, older ones beyond this count are deleted.
  BACKUP_RETENTION_COUNT: z.coerce.number().int().positive().default(7),
  // pg_dump/pg_restore binaries — default to PATH lookup (true in the
  // production Docker image and on GitHub Actions runners once
  // postgresql-client is installed); override locally if they're not on PATH.
  PG_DUMP_BIN: z.string().default('pg_dump'),
  PG_RESTORE_BIN: z.string().default('pg_restore'),
  // This API's own publicly-reachable base URL — used only to build the
  // Google Drive OAuth callback redirect_uri
  // (`${BACKEND_URL}/api/admin/backup/drive/callback`) for the admin panel's
  // "Connect Google Drive" button. That exact URL must be added as an
  // Authorized redirect URI on the "h3m-buckups" OAuth client in Google
  // Cloud Console (alongside the existing `http://localhost`, which
  // `backup:token`'s one-time CLI flow still uses) — see security/operations.md.
  BACKEND_URL: z.string().default('http://localhost:4000'),
});

export const env = envSchema.parse(process.env);

// Substrings that mean "this is a copied-from-.env.example placeholder, not a
// real secret". A forged admin JWT is game-over, so in production we refuse to
// boot rather than run on a guessable signing key.
const PLACEHOLDER_PATTERNS = [
  /change[-_ ]?me/i,
  /changeme/i,
  /your[-_ ]?secret/i,
  /replace[-_ ]?with/i,
  /example/i,
  /placeholder/i,
  /^secret$/i,
  /^changeit$/i,
];

/** Throws if a JWT secret is too weak to sign auth tokens with. Enforced at
 *  boot in production; exported so it can be unit-tested. */
export function assertStrongSecret(value: string, name: string): void {
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters.`);
  }
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(value))) {
    throw new Error(
      `${name} looks like a placeholder from .env.example. Generate a real one, e.g. \`openssl rand -hex 32\`.`
    );
  }
  if (new Set(value).size < 12) {
    throw new Error(`${name} has too little variety to be a real random secret.`);
  }
}

export function assertStrongSecrets(e: Pick<typeof env, 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'>): void {
  assertStrongSecret(e.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET');
  assertStrongSecret(e.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
  }
}

/** Throws if HCAPTCHA_SECRET is still hCaptcha's public test secret — real
 *  anti-bot protection requires a secret from a real registered site.
 *  Enforced at boot in production; exported so it can be unit-tested. */
export function assertRealCaptchaSecret(secret: string): void {
  if (secret === HCAPTCHA_TEST_SECRET) {
    throw new Error(
      'HCAPTCHA_SECRET is still the hCaptcha test secret. Register a real site at hCaptcha and set its secret.'
    );
  }
}

if (env.NODE_ENV === 'production') {
  assertStrongSecrets(env);
  assertRealCaptchaSecret(env.HCAPTCHA_SECRET);
}
