import { Request, Response } from 'express';
import * as adminAuthService from './admin-auth.service';

const REFRESH_COOKIE = 'refreshToken';

// MUST stay byte-for-byte identical to auth.controller.ts's `cookieOptions`.
// The admin flow deliberately reuses the customer refresh-cookie policy —
// httpOnly, strict SameSite, Secure only in production (over HTTPS), scoped to
// /api/auth so POST /api/auth/refresh can rotate it. A parity assertion in
// admin-auth.test.ts fails if the two ever drift.
const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
};

export async function adminLoginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body as { identifier: string; password: string };

  const { accessToken, refreshToken } = await adminAuthService.adminLogin(identifier, password, {
    ip: req.ip ?? 'unknown',
    userAgent: req.get('user-agent') ?? 'unknown',
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  res.json({ accessToken }); // same response shape as POST /api/auth/login
}
