import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/AppError';
import { env } from '../config/env';

/**
 * Step-up auth gate (S2). Put AFTER requireAuth (and any role gate) on the
 * few routes where a valid session is not enough — the caller must have
 * re-entered their password within the freshness window.
 *
 * It checks the access token's `auth_time` claim (epoch seconds), which is
 * set when a password is verified (login / admin-login / change-password /
 * POST /api/auth/step-up) and carried UNCHANGED through every silent
 * refresh. So a long-lived session that has only ever been kept alive by
 * refresh will fail this check even though its access token is "valid".
 *
 * On failure it throws `STEP_UP_REQUIRED` (HTTP 403 — deliberately not 401,
 * which the SPA would answer with a silent refresh that cannot help). The
 * frontend catches this code and shows a password prompt that calls
 * `POST /api/auth/step-up`, then retries the original request.
 */
export function requireFreshAuth(maxAgeSeconds = env.STEP_UP_FRESHNESS_MIN * 60) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('UNAUTHORIZED', 'Not authenticated'));

    const authTime = req.user.authTime ?? 0;
    const ageSeconds = Math.floor(Date.now() / 1000) - authTime;

    if (!authTime || ageSeconds > maxAgeSeconds) {
      return next(
        new AppError('STEP_UP_REQUIRED', 'Please re-enter your password to continue.', {
          maxAgeSeconds,
        })
      );
    }
    next();
  };
}
