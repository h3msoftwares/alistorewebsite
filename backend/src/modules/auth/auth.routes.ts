import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema';
import { registerHandler, loginHandler, logoutHandler, refreshHandler } from './auth.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Customer auth. Two per-IP buckets layered on top of the app-wide limiter and
 * the per-account lockout:
 *   - `/login`: 10 attempts / 15 min. Tighter than register because login is
 *     the credential-stuffing target; a real customer rarely needs >10 tries,
 *     and the 5-try per-account lockout already covers single-account attacks —
 *     this bucket is what stops one IP spraying many accounts. (Admin login is
 *     tighter still at 5; register is looser at 20.)
 *   - `/register`: 20 / 15 min.
 *
 * `rateLimit` defaults ON; `buildApp()` passes `false` under test so the suite
 * isn't throttled, and one focused test passes `true` to exercise the 429.
 */
export function authRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();
  const limitsOn = opts.rateLimit !== false;

  const loginLimiter: RequestHandler = limitsOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
        },
      })
    : passThrough;

  const registerLimiter: RequestHandler = limitsOn
    ? rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })
    : passThrough;

  router.post('/register', registerLimiter, validate({ body: registerSchema }), asyncHandler(registerHandler));
  router.post('/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
  router.post('/refresh', validate({ body: refreshSchema.partial() }), asyncHandler(refreshHandler));
  router.post('/logout', asyncHandler(logoutHandler));

  return router;
}

export default authRoutes;
