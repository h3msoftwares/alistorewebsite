import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { requireFreshAuth } from '../../middleware/step-up.middleware';
import { validate } from '../../middleware/validate.middleware';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import { setSmtpCredentialSchema } from './smtp-credential.schema';
import { getSmtpStatusHandler, setSmtpCredentialHandler, clearSmtpCredentialHandler } from './smtp-credential.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * The admin-configurable outgoing-mail account (Task 2). Strictly ADMIN (not
 * STAFF+ADMIN) — same reasoning as backup.routes.ts: this is
 * infrastructure/credentials-adjacent, not a day-to-day back-office task,
 * and unlike most secrets here it's a *standing* one (see
 * lib/secret-encryption.ts's doc comment).
 *
 * PATCH / (set): step-up gated (requireFreshAuth) — a hijacked-but-valid
 * admin session is not enough to redirect every outgoing password-reset /
 * verification / checkout-OTP email to an attacker-controlled mailbox (they
 * would see a copy of every one in that mailbox's own Sent folder). Tightly
 * rate-limited for the same reason.
 * DELETE / (clear): reverts to the env fallback — removes an override
 * rather than handing anyone a new standing credential, so no step-up.
 * GET /status: read-only, never returns the password.
 */
export function smtpCredentialRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();
  const rateLimitOn = opts.rateLimit ?? true;

  const setLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const clearLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  router.use(requireAuth, requireRole('ADMIN'));

  router.get('/status', asyncHandler(getSmtpStatusHandler));
  router.patch(
    '/',
    setLimiter,
    requireFreshAuth(),
    validate({ body: setSmtpCredentialSchema }),
    asyncHandler(setSmtpCredentialHandler)
  );
  router.delete('/', clearLimiter, asyncHandler(clearSmtpCredentialHandler));

  return router;
}
