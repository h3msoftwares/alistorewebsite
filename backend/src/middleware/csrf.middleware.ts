import { NextFunction, Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { AppError } from '../lib/AppError';

/**
 * CSRF protection, double-submit-cookie style.
 *
 * The app's authenticated API calls use a Bearer access token in the
 * Authorization header (set from memory by our own JS) and the refresh
 * cookie is SameSite=Strict, so cross-site forgery is already hard. This is
 * the explicit, defence-in-depth layer on top:
 *
 *  - every response makes sure a `csrfToken` cookie is set. It is NOT
 *    httpOnly, on purpose: our SPA reads it and echoes it back.
 *  - every state-changing request (anything but GET/HEAD/OPTIONS) must carry
 *    an `X-CSRF-Token` header whose value equals that cookie. A cross-site
 *    page can send the cookie but cannot read it to set the header, and
 *    cannot set a custom header on a simple form post at all.
 *
 * `/api/auth/refresh` is exempt: it runs during app bootstrap before any GET
 * has primed the cookie, and it is self-protected (the refreshToken cookie
 * it consumes is SameSite=Strict).
 */

export const CSRF_COOKIE = 'csrfToken';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/refresh']);
const MIN_LEN = 32;

function mint(): string {
  return randomBytes(32).toString('base64url');
}

function equal(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function csrfProtection(isProd: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookie = req.cookies?.[CSRF_COOKIE];
    let token: string = typeof cookie === 'string' && cookie.length >= MIN_LEN ? cookie : '';

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
    if (!header || !equal(header, token)) {
      return next(new AppError('FORBIDDEN', 'Invalid or missing CSRF token'));
    }

    next();
  };
}
