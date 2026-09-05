import type { Request } from 'express';
import { AppError } from '../../lib/AppError';

export type CatalogListStatus = 'active' | 'archived' | 'all';

function isStaff(req: Request): boolean {
  return req.user?.role === 'STAFF' || req.user?.role === 'ADMIN';
}

/**
 * Resolves the effective list `status` for a catalog listing endpoint and
 * enforces that only STAFF/ADMIN can ask for anything other than the
 * storefront-visible set. `includeInactive=true` is a deprecated alias for
 * `status=all`. Public GET routes must use `optionalAuth` so `req.user` is
 * populated when a token is present.
 */
export function resolveListStatus(
  req: Request,
  status: CatalogListStatus | undefined,
  includeInactive?: boolean
): CatalogListStatus {
  const effective: CatalogListStatus = status ?? (includeInactive ? 'all' : 'active');
  if (effective !== 'active' && !isStaff(req)) {
    throw new AppError('FORBIDDEN', 'Only staff can list archived or inactive records.');
  }
  return effective;
}
