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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
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
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Email (forgot-password). Defaulted to empty rather than required — a
  // checkout without SMTP configured yet should still boot; lib/mailer.ts
  // treats an unset SMTP_HOST as "not configured" and no-ops (logging a
  // warning) instead of throwing, so the endpoint's response is never
  // affected either way.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM: z.string().default("Ali's Store <no-reply@example.com>"),
  // Password-reset token lifetime, in minutes.
  RESET_TOKEN_TTL_MIN: z.coerce.number().default(30),
  // Email-verification token lifetime, in minutes. Longer than the reset
  // token — a fresh signup may not check their inbox for a while.
  EMAIL_VERIFICATION_TTL_MIN: z.coerce.number().default(1440), // 24h
  // Base URL the reset / verification links are built against:
  // `${FRONTEND_URL}/{locale}/reset-password?token=...`
  // `${FRONTEND_URL}/{locale}/verify-email?token=...`
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // ImageKit — signs the admin image uploader's short-lived upload token
  // (see modules/uploads). Defaulted to empty rather than required, same
  // reasoning as SMTP_HOST: the server still boots, the upload-auth endpoint
  // just 503s with a clear "not configured" message instead.
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

if (env.NODE_ENV === 'production') {
  assertStrongSecrets(env);
}
