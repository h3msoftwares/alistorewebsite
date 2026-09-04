import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { forgotPasswordSchema, resetPasswordSchema } from './password-reset.schema';
import { forgotPasswordHandler, resetPasswordHandler } from './password-reset.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

const RATE_LIMITED = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
};

/**
 * Password reset — shared across every role (CUSTOMER/STAFF/ADMIN), one flow,
 * not role-specific. Treated as a hostile surface, same as admin-login:
 *
 * POST /forgot-password:
 *   - per-IP limit: 10 / 15 min. Looser than admin-login's 5/15min because
 *     this is a customer-facing flow that can legitimately sit behind a
 *     shared NAT/office IP — still tight enough to blunt an
 *     email-enumeration sweep across many addresses from one IP.
 *   - per-email limit: 3 / 15 min, keyed on the submitted address
 *     (lower-cased), regardless of whether it resolves to a real account.
 *     Stops someone from flooding one victim's inbox via many different IPs.
 *     It fires identically for a real or made-up address, so it leaks
 *     nothing about account existence — only "this exact string has been
 *     asked about a lot lately", which isn't an enumeration signal.
 *
 * POST /reset-password:
 *   - per-IP limit: 10 / 15 min. The token itself is 256 bits of entropy —
 *     brute force is infeasible regardless — this is defense in depth /
 *     hygiene, generous enough that a fumbled copy-paste retry won't trip it.
 *
 * All limiters default ON; buildApp() turns them off under test.
 */
export function passwordResetRoutes(
  opts: { forgotPasswordRateLimit?: boolean; resetPasswordRateLimit?: boolean } = {}
): Router {
  const router = Router();

  const forgotOn = opts.forgotPasswordRateLimit !== false;
  const resetOn = opts.resetPasswordRateLimit !== false;

  const forgotIpLimiter: RequestHandler = forgotOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED,
      })
    : passThrough;

  const forgotEmailLimiter: RequestHandler = forgotOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
          const email = typeof req.body?.email === 'string' ? req.body.email : '';
          return email.trim().toLowerCase() || 'unknown';
        },
        message: RATE_LIMITED,
      })
    : passThrough;

  const resetIpLimiter: RequestHandler = resetOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED,
      })
    : passThrough;

  router.post(
    '/forgot-password',
    forgotIpLimiter,
    validate({ body: forgotPasswordSchema }),
    // Runs after validate() so it only ever sees a real, parsed email string
    // — a malformed body 400s before it can burn down anyone's bucket.
    forgotEmailLimiter,
    asyncHandler(forgotPasswordHandler)
  );

  router.post(
    '/reset-password',
    resetIpLimiter,
    validate({ body: resetPasswordSchema }),
    asyncHandler(resetPasswordHandler)
  );

  return router;
}
