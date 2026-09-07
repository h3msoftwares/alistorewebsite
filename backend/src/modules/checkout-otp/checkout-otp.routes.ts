import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { optionalAuth } from '../../middleware/auth.middleware';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import { requestOtpSchema, verifyOtpSchema } from './checkout-otp.schema';
import { requestOtpHandler, verifyOtpHandler } from './checkout-otp.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * POST /request is the costly endpoint (spends an email send) and is fully
 * DB-backed rate-limited inside checkout-otp.service.ts (per-email window +
 * cooldown, per-IP window — see there) — no in-memory limiter needed here.
 *
 * POST /verify already caps wrong guesses per-code (5 attempts, enforced in
 * the service); this in-memory per-IP limiter is just defense-in-depth on
 * top of that, same "off under test" convention as the auth module's
 * limiters.
 */
export function checkoutOtpRoutes(opts: { verifyRateLimit?: boolean } = {}): Router {
  const router = Router();
  const verifyOn = opts.verifyRateLimit !== false;

  const verifyIpLimiter: RequestHandler = verifyOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  router.post('/request', validate({ body: requestOtpSchema }), asyncHandler(requestOtpHandler));
  router.post(
    '/verify',
    verifyIpLimiter,
    optionalAuth,
    validate({ body: verifyOtpSchema }),
    asyncHandler(verifyOtpHandler)
  );

  return router;
}
