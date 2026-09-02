import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/AppError';
import { AuthedUser } from './auth.middleware';

/** Simple role gate for the admin panel. Only two roles ever need this
 *  (STAFF, ADMIN), so a DB/cache-backed permission table (as pos-backend
 *  used with Redis) is unnecessary here — this checks the JWT claim directly. */
export function requireRole(...roles: AuthedUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('UNAUTHORIZED', 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}
