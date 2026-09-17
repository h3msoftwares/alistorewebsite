import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import {
  gmailStatusHandler,
  gmailConnectHandler,
  gmailCallbackHandler,
  gmailDisconnectHandler,
} from './mail.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * "Connect Gmail account" (send outgoing mail via the Gmail API instead of
 * SMTP — see modules/mail/gmail.client.ts's module doc). Strictly ADMIN,
 * same as the SMTP app-password flow it complements
 * (settings/smtp-credential.routes.ts) — credentials-adjacent
 * infrastructure, not a day-to-day back-office task.
 *
 * GET /gmail/callback: the ONE route here reachable without a bearer token
 * (Google's own redirect) — same reasoning as backup.routes.ts's
 * /drive/callback, registered BEFORE the role gate below.
 */
export function mailRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();
  const rateLimitOn = opts.rateLimit ?? true;

  const gmailActionLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const callbackLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  router.get('/gmail/callback', callbackLimiter, asyncHandler(gmailCallbackHandler));

  router.use(requireAuth, requireRole('ADMIN'));

  router.get('/gmail/status', asyncHandler(gmailStatusHandler));
  router.get('/gmail/connect', gmailActionLimiter, asyncHandler(gmailConnectHandler));
  router.post('/gmail/disconnect', gmailActionLimiter, asyncHandler(gmailDisconnectHandler));

  return router;
}
