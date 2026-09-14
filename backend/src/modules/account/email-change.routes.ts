import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import { requestEmailChangeSchema, confirmEmailChangeSchema } from './email-change.schema';
import { requestEmailChangeHandler, confirmEmailChangeHandler } from './email-change.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Task 3: account email change, with a confirmation link sent to the new
 * address before it ever takes effect. Own top-level router (like
 * password-reset / email-verification) rather than nested under
 * user.routes.ts, because /confirm must be reachable WITHOUT a session — the
 * link is opened from an email client, possibly on a different device.
 *
 * POST /request: requireAuth + requireRole('ADMIN') — this is an admin-only
 * self-service action (not a general customer/STAFF feature). The request
 * body's own `currentPassword` is verified server-side (see
 * email-change.service.ts), which is what stands in for step-up here; no
 * separate requireFreshAuth on top of that (it would just mean asking for
 * the password twice in the same form). Rate-limited 5/15min/IP — mirrors
 * change-password's hijacked-session brute-force hygiene.
 *
 * POST /confirm: public (token-only, 256 bits of entropy — brute force is
 * infeasible), same per-IP hygiene limit as verify-email (10/15min). No role
 * check needed here: a token can only exist because an ADMIN passed the
 * gate above to create it.
 *
 * Limiters default ON; buildApp() turns them off under test.
 */
export function emailChangeRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();
  const rateLimitOn = opts.rateLimit ?? true;

  const requestLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const confirmLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  router.post(
    '/request',
    requireAuth,
    requireRole('ADMIN'),
    requestLimiter,
    validate({ body: requestEmailChangeSchema }),
    asyncHandler(requestEmailChangeHandler)
  );

  router.post(
    '/confirm',
    confirmLimiter,
    validate({ body: confirmEmailChangeSchema }),
    asyncHandler(confirmEmailChangeHandler)
  );

  return router;
}
