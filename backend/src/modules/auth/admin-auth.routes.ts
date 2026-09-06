import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { adminLoginSchema } from './auth.schema';
import { adminLoginHandler } from './admin-auth.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * POST /api/auth/ali-admin-login — separate from the customer POST
 * /api/auth/login on purpose. The path is deliberately non-obvious (not
 * `/admin-login`) so blanket admin-endpoint scanners / credential-stuffing
 * bots don't find it by guessing; the real defences below still stand on
 * their own.
 *   - stricter per-IP rate limit: 5 attempts / 15 min (the customer auth
 *   - stricter per-IP rate limit: 5 attempts / 15 min (the customer auth
 *     bucket is 20 / 15 min). Legitimate admin logins are rare, and this is
 *     the highest-value credential surface in the app, so a tight cap costs a
 *     real admin nothing (a few fat-fingered tries fit) while throttling
 *     credential-stuffing hard. It layers on top of the per-account lockout:
 *     the rate limit stops single-IP brute force, the lockout stops
 *     distributed / IP-rotating attacks on one account.
 *   - server-side STAFF/ADMIN role gate (in the service, after password
 *     verify) — the client never asserts its own role.
 *   - uniform "invalid credentials" for every failure mode.
 *   - every attempt written to the audit log.
 *
 * `rateLimit` defaults ON. `buildApp()` turns it off under test so the rest of
 * the suite isn't throttled; one focused test passes `true` to exercise it.
 */
export function adminAuthRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();

  const limiter: RequestHandler =
    opts.rateLimit === false
      ? passThrough
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 5,
          standardHeaders: true,
          legacyHeaders: false,
          message: {
            error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
          },
        });

  router.post(
    '/ali-admin-login',
    limiter,
    validate({ body: adminLoginSchema }),
    asyncHandler(adminLoginHandler)
  );

  return router;
}
