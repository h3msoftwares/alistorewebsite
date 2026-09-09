import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import { stepUpSchema } from './auth.schema';
import { stepUpHandler } from './step-up.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * POST /api/auth/step-up — re-authenticate an already-signed-in user by
 * password only, to unlock step-up-protected actions.
 *
 * Per-IP limit 10 / 15 min — mirrors change-password: the route already
 * requires a valid session, so this is just hygiene against a hijacked
 * session brute-forcing the password. Limiter defaults ON; buildApp() turns
 * it off under test.
 */
export function stepUpRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();
  const limiter: RequestHandler =
    opts.rateLimit !== false
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 10,
          standardHeaders: true,
          legacyHeaders: false,
          message: RATE_LIMITED_BODY,
        })
      : passThrough;

  router.post(
    '/step-up',
    requireAuth,
    limiter,
    validate({ body: stepUpSchema }),
    asyncHandler(stepUpHandler)
  );

  return router;
}
