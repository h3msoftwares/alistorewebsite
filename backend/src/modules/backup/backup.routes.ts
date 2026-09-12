import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { requireFreshAuth } from '../../middleware/step-up.middleware';
import { validate } from '../../middleware/validate.middleware';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import { backupIdParamSchema } from './backup.schema';
import {
  runBackupHandler,
  listBackupsHandler,
  restoreBackupHandler,
  driveStatusHandler,
  driveConnectHandler,
  driveCallbackHandler,
  driveDisconnectHandler,
} from './backup.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Database backups — strictly ADMIN (not STAFF+ADMIN like the rest of the
 * admin panel): this is infrastructure/credentials-adjacent, not a
 * day-to-day back-office task.
 *
 * POST /: triggers a real pg_dump + Drive upload — modest per-IP limit (a
 * manual trigger is rare; 5/15min is generous for a human clicking a button,
 * tight enough to stop a compromised admin session from being used to spam
 * pg_dump/Drive-API calls into a resource-exhaustion vector).
 * GET /: read-only Drive listing — no limiter needed beyond the app-wide one.
 * POST /:id/restore: DESTRUCTIVE — downloads a chosen backup and pg_restores
 * it over the live database. On top of the ADMIN role gate: step-up re-auth
 * (requireFreshAuth — a valid session alone isn't enough, same bar as an
 * order-status change or a direct stock edit) and a tighter rate limit than
 * the run/list routes (3/15min — this should almost never legitimately fire
 * more than once or twice in a sitting).
 * GET /drive/callback: the ONE route in this module reachable without a
 * bearer token at all (Google's own redirect) — a per-IP limit here is the
 * only rate-limit defense an anonymous caller can't route around by simply
 * not being logged in.
 */
export function backupRoutes(opts: { rateLimit?: boolean } = {}): Router {
  const router = Router();
  const rateLimitOn = opts.rateLimit ?? true;

  const runLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const restoreLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  // Generous but bounded — legitimate use is a handful of clicks per
  // sitting; this exists to blunt a hammered/scripted call, not to pace a
  // human.
  const driveActionLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  // Looser than the ADMIN-gated routes above (20 vs 10) — a real consent
  // round-trip can legitimately retry (a slow network, the user backing out
  // and re-approving), and this is the one route an anonymous caller can hit
  // without ever having a bearer token to lose.
  const callbackLimiter: RequestHandler = rateLimitOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  // Google's redirect after consent lands here as a plain top-level GET with
  // no Authorization header — it can't go through requireAuth. Registered
  // BEFORE the role gate below; drive-state.ts's signed `state` param is
  // this route's actual authorization check (see backup.controller.ts).
  router.get('/drive/callback', callbackLimiter, asyncHandler(driveCallbackHandler));

  router.use(requireAuth, requireRole('ADMIN'));

  router.get('/drive/status', asyncHandler(driveStatusHandler));
  router.get('/drive/connect', driveActionLimiter, asyncHandler(driveConnectHandler));
  router.post('/drive/disconnect', driveActionLimiter, asyncHandler(driveDisconnectHandler));

  router.post('/', runLimiter, asyncHandler(runBackupHandler));
  router.get('/', asyncHandler(listBackupsHandler));
  router.post(
    '/:id/restore',
    restoreLimiter,
    requireFreshAuth(),
    validate({ params: backupIdParamSchema }),
    asyncHandler(restoreBackupHandler)
  );

  return router;
}
