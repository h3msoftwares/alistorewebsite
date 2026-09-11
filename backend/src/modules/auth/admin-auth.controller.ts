import { Request, Response } from 'express';
import * as adminAuthService from './admin-auth.service';
import * as authService from './auth.service';

// Distinct name AND path from the customer session's `refreshToken` @
// `/api/auth` (auth.controller.ts) — see fix-list.md #13. Before this, both
// flows wrote to the exact same (name, path) cookie slot, so logging into
// the admin panel in a browser that also had a customer session silently
// overwrote it; the customer tab's next silent refresh would then come back
// as the admin's identity. Scoping the admin cookie to its own path means a
// browser can hold both sessions at once, each only sent to its own
// refresh/logout endpoint.
const ADMIN_REFRESH_COOKIE = 'adminRefreshToken';
const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/admin/auth',
};

export async function adminLoginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body as { identifier: string; password: string };

  const { accessToken, refreshToken } = await adminAuthService.adminLogin(identifier, password, {
    ip: req.ip ?? 'unknown',
    userAgent: req.get('user-agent') ?? 'unknown',
  });

  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, adminCookieOptions);
  res.json({ accessToken }); // same response shape as POST /api/auth/login
}

/** POST /api/admin/auth/refresh — the admin-session twin of
 *  auth.controller.ts's refreshHandler, reading/writing the admin-scoped
 *  cookie instead. `authService.refresh()` itself is role-agnostic (it
 *  re-derives the role from the User row), so no service-layer change was
 *  needed — only which cookie this endpoint reads and writes. */
export async function adminRefreshHandler(req: Request, res: Response) {
  const token = req.cookies?.[ADMIN_REFRESH_COOKIE] ?? req.body?.refreshToken;
  const { accessToken, refreshToken } = await authService.refresh(token);
  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, adminCookieOptions);
  res.json({ accessToken });
}

/** POST /api/admin/auth/logout — the admin-session twin of
 *  auth.controller.ts's logoutHandler. */
export async function adminLogoutHandler(req: Request, res: Response) {
  const token = req.cookies?.[ADMIN_REFRESH_COOKIE] ?? req.body?.refreshToken;
  if (token) await authService.logout(token);
  res.clearCookie(ADMIN_REFRESH_COOKIE, adminCookieOptions);
  res.status(204).send();
}
