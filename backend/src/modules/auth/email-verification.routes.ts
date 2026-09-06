import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { RATE_LIMITED_BODY, emailRateLimitKey } from '../../lib/rate-limit';
import { verifyEmailSchema, resendVerificationSchema } from './email-verification.schema';
import { verifyEmailHandler, resendVerificationHandler } from './email-verification.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Email verification — a hostile surface, treated like forgot-password / reset.
 *
 * POST /verify-email:
 *   - per-IP limit: 10 / 15 min. The token is 256 bits of entropy so brute
 *     force is infeasible regardless — this is defense in depth / hygiene,
 *     generous enough that a fumbled copy-paste retry won't trip it.
 *
 * POST /resend-verification:
 *   - per-IP limit: 10 / 15 min.
 *   - per-email limit: 3 / 15 min, keyed on the submitted address, regardless
 *     of whether it resolves to a real / unverified account — stops one
 *     victim's inbox being flooded from many rotating IPs. Same numbers and
 *     reasoning as forgot-password's dual limiting. Mounted AFTER validate()
 *     so a malformed body 400s before it can burn a bucket.
 *
 * Limiters default ON; buildApp() turns them off under test.
 */
export function emailVerificationRoutes(
  opts: { verifyRateLimit?: boolean; resendRateLimit?: boolean } = {}
): Router {
  const router = Router();
  const verifyOn = opts.verifyRateLimit !== false;
  const resendOn = opts.resendRateLimit !== false;

  const verifyIpLimiter: RequestHandler = verifyOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const resendIpLimiter: RequestHandler = resendOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const resendEmailLimiter: RequestHandler = resendOn
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
    '/verify-email',
    verifyIpLimiter,
    validate({ body: verifyEmailSchema }),
    asyncHandler(verifyEmailHandler)
  );

  router.post(
    '/resend-verification',
    resendIpLimiter,
    validate({ body: resendVerificationSchema }),
    resendEmailLimiter,
    asyncHandler(resendVerificationHandler)
  );

  return router;
}
