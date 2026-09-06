import { Request, Response } from 'express';
import * as authService from './auth.service';
import { REFRESH_COOKIE, cookieOptions } from './auth.controller';

export async function changePasswordHandler(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  const { accessToken, refreshToken } = await authService.changePassword(
    req.user!.id,
    currentPassword,
    newPassword
  );
  // Every other session was just revoked; re-issue for this browser so the
  // user isn't logged out of the tab they changed it in.
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ accessToken });
}
