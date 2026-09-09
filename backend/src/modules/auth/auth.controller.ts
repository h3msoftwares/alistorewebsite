import { Request, Response } from 'express';
import * as authService from './auth.service';
import { mergeGuestCartIntoUser } from '../cart/cart.service';
import { GUEST_CART_COOKIE, rotateGuestCartCookie } from '../cart/guest-cart-cookie';

// Exported so the email-verification controller and the test suite reference
// the exact same string. Deliberately identical for "new email", "email
// already in use", and "resend to an unverified account" — the caller can't
// tell which happened.
export const REGISTER_MESSAGE =
  "If this email isn't already in use, we've sent a verification link.";

// Exported so the change-password controller sets the refresh cookie exactly
// the same way login/refresh do.
export const REFRESH_COOKIE = 'refreshToken';
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
};

/** Fold whatever the guest had in their cookie-session cart into the
 *  just-authenticated user's cart, then ROTATE the guest session id (S9 —
 *  session-fixation mitigation: the pre-login id is retired and replaced,
 *  not merely deleted, so a value an attacker pre-seeded in the victim's
 *  browser cannot be reused after login). Best-effort — a merge failure
 *  must not fail the login response; the rotation still happens. */
async function absorbGuestCart(req: Request, res: Response, userId: string) {
  const sessionID = req.cookies?.[GUEST_CART_COOKIE];
  if (!sessionID) return;
  try {
    await mergeGuestCartIntoUser(sessionID, userId);
  } catch {
    // ignore — the user is still logged in, just without the guest cart merged
  }
  rotateGuestCartCookie(res);
}

export async function registerHandler(req: Request, res: Response) {
  // No session is created — registration only ever mails a verification link.
  // Always the same status + body regardless of which branch ran in the
  // service (see authService.register).
  await authService.register(req.body);
  res.status(201).json({ message: REGISTER_MESSAGE });
}

export async function loginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body;
  const { accessToken, refreshToken, userId } = await authService.login(identifier, password, {
    ip: req.ip ?? 'unknown',
    userAgent: req.get('user-agent') ?? 'unknown',
  });
  await absorbGuestCart(req, res, userId);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ accessToken });
}

export async function refreshHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
  const { accessToken, refreshToken } = await authService.refresh(token);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ accessToken });
}

export async function logoutHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
  if (token) await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).send();
}
