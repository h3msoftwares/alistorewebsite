import { Request, Response } from 'express';
import * as authService from './auth.service';
import { mergeGuestCartIntoUser } from '../cart/cart.service';

const REFRESH_COOKIE = 'refreshToken';
const GUEST_CART_COOKIE = 'cartSession';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
};

/** Fold whatever the guest had in their cookie-session cart into the
 *  just-authenticated user's cart, then clear the guest cookie. Best-effort —
 *  a merge failure must not fail the login/register response. */
async function absorbGuestCart(req: Request, res: Response, userId: string) {
  const sessionID = req.cookies?.[GUEST_CART_COOKIE];
  if (!sessionID) return;
  try {
    await mergeGuestCartIntoUser(sessionID, userId);
  } catch {
    // ignore — the user is still logged in, just without the guest cart merged
  }
  res.clearCookie(GUEST_CART_COOKIE);
}

export async function registerHandler(req: Request, res: Response) {
  const { accessToken, refreshToken, user } = await authService.register(req.body);
  await absorbGuestCart(req, res, user.id);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.status(201).json({
    accessToken,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
  });
}

export async function loginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body;
  const { accessToken, refreshToken, userId } = await authService.login(identifier, password);
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
