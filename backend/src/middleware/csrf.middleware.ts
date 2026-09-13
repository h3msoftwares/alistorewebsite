import { NextFunction, Request, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';

/**
 * CSRF protection — **signed** double-submit cookie (OWASP "Signed
 * Double-Submit Cookie").
 *
 * The `csrfToken` cookie is `<random>.<HMAC(server-secret, random)>`. It is
 * NOT httpOnly (our SPA reads it and echoes it in the `X-CSRF-Token`
 * header). Every state-changing request must present a header that equals
 * the cookie AND whose HMAC segment verifies against our secret.
 *
 * Why signed, not plain double-submit: a plain double-submit only proves the
 * caller can read *a* cookie. If an attacker can *write* a `csrfToken`
 * cookie into the victim's browser (a sibling-subdomain XSS, a
 * cookie-injection bug, an intermediary), they can pick a value and satisfy
 * `header === cookie`. Signing means a forged value can't produce a valid
 * HMAC, so a cookie the attacker planted is rejected. Combined with the
 * SameSite=Strict auth cookies and the CORS allowlist, this is defence in
 * depth that doesn't fail open if one layer breaks.
 *
 * The signing key is derived from `JWT_ACCESS_SECRET` (already
 * strong-secret-asserted in production) with a domain-separation label, so
 * there's no new env var / rotation surface.
 *
 * `/api/auth/refresh` and `/api/admin/auth/refresh` are exempt: both run
 * during app bootstrap before any GET has primed the cookie, and both are
 * self-protected the same way — the refreshToken / adminRefreshToken cookie
 * each one consumes is SameSite=Strict (see app.ts's comment on why the two
 * sessions have separate cookies at all). Without this, an admin's access
 * token expiring (or just a fresh page load with no prior CSRF-priming GET)
 * silently fails the refresh and bounces them out of the admin panel.
 */

export const CSRF_COOKIE = 'csrfToken';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/refresh', '/api/admin/auth/refresh']);

const SIGNING_KEY = createHmac('sha256', env.JWT_ACCESS_SECRET).update('csrf-double-submit-v1').digest();

function sign(value: string): string {
  return createHmac('sha256', SIGNING_KEY).update(value).digest('base64url');
}

function mint(): string {
  const value = randomBytes(32).toString('base64url');
  return `${value}.${sign(value)}`;
}

function equal(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** A well-formed, correctly-signed token? */
function isValidToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const value = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  return equal(mac, sign(value));
}

export function csrfProtection(isProd: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookie = req.cookies?.[CSRF_COOKIE];
    // Accept the existing cookie only if it carries a valid signature;
    // anything else (absent, legacy unsigned, tampered, planted) gets
    // replaced with a fresh signed one.
    let token: string = isValidToken(cookie) ? cookie : '';

    if (!token) {
      token = mint();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
      });
    }

    // So `GET /api/csrf` can echo the effective token even on the very first
    // request, before the freshly-set cookie has made a round trip.
    res.locals.csrfToken = token;

    if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) return next();

    const header = req.get(CSRF_HEADER);
    if (!header || !equal(header, token) || !isValidToken(header)) {
      return next(new AppError('FORBIDDEN', 'Invalid or missing CSRF token'));
    }

    next();
  };
}
