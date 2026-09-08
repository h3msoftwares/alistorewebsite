import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../lib/AppError';
import { effectivePermissions } from '../lib/permissions';
import { AuthedUser } from './auth.middleware';

/** Coarse gate for the admin panel: is the caller STAFF or ADMIN at all.
 *  Granular access is by `requirePermission` below. Reads the JWT claim
 *  directly — no DB hit. */
export function requireRole(...roles: AuthedUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('UNAUTHORIZED', 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

/**
 * The permissions a user effectively holds right now — resolved from their
 * role, assigned custom role and per-user revokes. Cached on the request so
 * chained guards / handlers don't re-query.
 */
export async function loadEffectivePermissions(req: Request): Promise<Set<string>> {
  if (req.permissions) return req.permissions;
  if (!req.user) return new Set();
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true, revokedPermissions: true, customRole: { select: { permissions: true } } },
  });
  const set = user
    ? effectivePermissions({
        role: user.role,
        rolePermissions: user.customRole?.permissions ?? null,
        revoked: user.revokedPermissions,
      })
    : new Set<string>();
  req.permissions = set;
  return set;
}

/** Requires every listed permission key (e.g. `requirePermission('orders:manage')`).
 *  Layer it after `requireRole('STAFF','ADMIN')`. */
export function requirePermission(...required: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('UNAUTHORIZED', 'Not authenticated'));
    try {
      const held = await loadEffectivePermissions(req);
      const missing = required.filter((k) => !held.has(k));
      if (missing.length > 0) {
        return next(new AppError('FORBIDDEN', `Missing permission: ${missing.join(', ')}`));
      }
      next();
    } catch (e) {
      next(e as Error);
    }
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Effective admin permissions for req.user, memoised by loadEffectivePermissions. */
      permissions?: Set<string>;
    }
  }
}
