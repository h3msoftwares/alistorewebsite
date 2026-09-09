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

// A hard ceiling on access-token lifetime, independent of the token's own
// `exp`. The longest legitimate access TTL is the 15-min customer token; 1h
// leaves generous room for clock skew / a future TTL bump while still
// rejecting a token whose `iat` is implausibly old.
const ACCESS_TOKEN_MAX_AGE = '1h';

/** Verify + decode an access token. Pins HS256, enforces the token's own
 *  `exp`, ALSO enforces `ACCESS_TOKEN_MAX_AGE` against `iat` (so a token
 *  minted with no `exp` — only possible if the signing secret leaks — is
 *  still not immortal), and requires `exp` to be present at all. Throws on
 *  any failure. */
function verifyAccessToken(token: string): AuthedUser {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    maxAge: ACCESS_TOKEN_MAX_AGE,
  }) as AuthedUser & { auth_time?: number; exp?: number };
  if (typeof payload.exp !== 'number') {
    throw new Error('access token has no exp');
  }
  return { id: payload.id, role: payload.role, authTime: payload.auth_time };
}

/** Requires a valid access token. Use on any route that needs to know who's calling. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Missing bearer token'));
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
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
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
  } catch {
    // ignore invalid token on optional routes — treated as guest
  }
  next();
}
