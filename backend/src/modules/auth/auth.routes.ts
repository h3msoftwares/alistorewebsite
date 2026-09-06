import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { RATE_LIMITED_BODY, emailRateLimitKey } from '../../lib/rate-limit';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema';
import { registerHandler, loginHandler, logoutHandler, refreshHandler } from './auth.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Customer auth. Per-IP buckets on top of the app-wide limiter and the
 * per-account lockout:
 *   - `/login`: 10 attempts / 15 min. Login is the credential-stuffing
 *     target; a real customer rarely needs >10 tries, and the 5-try
 *     per-account lockout covers single-account attacks — this bucket stops
 *     one IP spraying many accounts. (Admin login is tighter at 5.)
 *   - `/register`: dual limiting, same numbers/reasoning as forgot-password —
 *     per-IP 10 / 15 min AND per-email 3 / 15 min (keyed on the submitted
 *     address, real or not, so it leaks nothing about account existence).
 *     The per-email limiter runs AFTER validate() so a malformed body 400s
 *     before it can burn a bucket.
 *
 * `rateLimit` defaults ON; `buildApp()` passes `false` under test so the suite
 * isn't throttled, and a focused test passes `true` to exercise the 429.
 */
export function authRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();
  const limitsOn = opts.rateLimit !== false;

  const perIp = (max: number): RequestHandler =>
    limitsOn
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          max,
          standardHeaders: true,
          legacyHeaders: false,
          message: RATE_LIMITED_BODY,
        })
      : passThrough;

  const loginLimiter = perIp(10);
  const registerIpLimiter = perIp(10);

  const registerEmailLimiter: RequestHandler = limitsOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: emailRateLimitKey,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  router.post(
    '/register',
    registerIpLimiter,
    validate({ body: registerSchema }),
    registerEmailLimiter,
    asyncHandler(registerHandler)
  );
  router.post('/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
  router.post('/refresh', validate({ body: refreshSchema.partial() }), asyncHandler(refreshHandler));
  router.post('/logout', asyncHandler(logoutHandler));

  return router;
}

export default authRoutes;
