import { Request, Response } from 'express';
import * as authService from './auth.service';
import { REFRESH_COOKIE, cookieOptions } from './auth.controller';
import { recordAudit } from '../../lib/audit';

export async function changePasswordHandler(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  // Same audit shape as email-change.controller.ts's requestEmailChangeHandler:
  // a failed attempt (near-always a wrong current password) is logged too —
  // it's evidence of a hijacked/borrowed session — never the password or
  // hash itself, just that an attempt happened and why it failed.
  const { accessToken, refreshToken } = await authService
    .changePassword(req.user!.id, currentPassword, newPassword)
    .catch(async (err: Error) => {
      await recordAudit({
        entityType: 'User',
        entityID: req.user!.id,
        action: 'password_change.failed',
        actorID: req.user!.id,
        metadata: { error: err.message },
      });
      throw err;
    });

  await recordAudit({
    entityType: 'User',
    entityID: req.user!.id,
    action: 'password_change',
    actorID: req.user!.id,
    metadata: {},
  });

  // Every other session was just revoked; re-issue for this browser so the
  // user isn't logged out of the tab they changed it in.
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ accessToken });
}
