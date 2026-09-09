import { Request, Response } from 'express';
import * as authService from './auth.service';
import { prisma } from '../../config/prisma';
import { REFRESH_COOKIE, cookieOptions } from './auth.controller';

/**
 * POST /api/auth/step-up — re-verify the signed-in user's password to unlock
 * a step-up-protected action (see requireFreshAuth). Issues a fresh token
 * pair with a new `auth_time`; other sessions are left intact.
 */
export async function stepUpHandler(req: Request, res: Response) {
  const { password } = req.body as { password: string };
  const userId = req.user!.id;

  let ok = true;
  try {
    const { accessToken, refreshToken } = await authService.stepUp(userId, password);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken });
  } catch (err) {
    ok = false;
    throw err;
  } finally {
    // Append-only audit trail, same shape as the login attempts. Awaited so
    // the row is durable before the handler returns (a fire-and-forget write
    // can be lost, and races the tests); `.catch` keeps a write failure from
    // changing the response, which is already sent by this point.
    await prisma.auditLog
      .create({
        data: {
          entityType: 'auth',
          entityID: userId,
          action: `step_up.${ok ? 'success' : 'invalid'}`,
          actorID: userId,
          metadata: {
            ip: req.ip ?? 'unknown',
            userAgent: req.get('user-agent') ?? 'unknown',
            outcome: ok ? 'success' : 'invalid',
          },
        },
      })
      .catch((e) => console.error('[step-up] audit-log write failed', e));
  }
}
