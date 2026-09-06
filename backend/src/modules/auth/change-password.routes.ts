import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import { changePasswordSchema } from './change-password.schema';
import { changePasswordHandler } from './change-password.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * POST /api/auth/change-password — signed-in credential change.
 *
 * Per-IP limit 10 / 15 min: the endpoint already requires a valid session
 * and verifies the current password, so this is just hygiene against a
 * hijacked-session brute force of the current password. Limiter defaults ON;
 * buildApp() turns it off under test.
 */
export function changePasswordRoutes(opts: { rateLimit?: boolean } = {}): Router {
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
    '/change-password',
    requireAuth,
    limiter,
    validate({ body: changePasswordSchema }),
    asyncHandler(changePasswordHandler)
  );

  return router;
}
