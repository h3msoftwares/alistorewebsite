import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';

export interface AuthedUser {
  id: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  /** Epoch seconds a password was last verified for this login (the JWT
   *  `auth_time` claim). Undefined for a token minted before step-up auth
   *  shipped — treated as "never" by requireFreshAuth. */
  authTime?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** Requires a valid access token. Use on any route that needs to know who's calling. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Missing bearer token'));
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AuthedUser & { auth_time?: number };
    req.user = { id: payload.id, role: payload.role, authTime: payload.auth_time };
    next();
  } catch {
    next(new AppError('UNAUTHORIZED', 'Invalid or expired access token'));
  }
}

/** Same as requireAuth but doesn't reject when there's no token — used on
 *  storefront routes that behave differently for guests vs. logged-in users
 *  (cart, checkout) without forcing a login. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AuthedUser & { auth_time?: number };
    req.user = { id: payload.id, role: payload.role, authTime: payload.auth_time };
  } catch {
    // ignore invalid token on optional routes — treated as guest
  }
  next();
}
