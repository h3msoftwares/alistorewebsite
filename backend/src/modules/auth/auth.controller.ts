import { Request, Response } from 'express';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'refreshToken';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
};

export async function registerHandler(req: Request, res: Response) {
  const { accessToken, refreshToken, user } = await authService.register(req.body);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.status(201).json({ accessToken, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
}

export async function loginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body;
  const { accessToken, refreshToken } = await authService.login(identifier, password);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ accessToken });
}

export async function refreshHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body.refreshToken;
  const { accessToken, refreshToken } = await authService.refresh(token);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ accessToken });
}

export async function logoutHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body.refreshToken;
  if (token) await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).send();
}
