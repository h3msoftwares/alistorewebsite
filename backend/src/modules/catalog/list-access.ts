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
 *
 * Two distinct denial reasons, two distinct status codes (fix-list.md #5,
 * resolves admin-list-403):
 *   - No `req.user` at all (401 UNAUTHORIZED) — `optionalAuth` treats a
 *     missing/expired/invalid token identically to a genuine guest, so this
 *     is ambiguous at this layer: it could be a real anonymous visitor, or a
 *     staff member whose short-lived (5 min) admin token quietly expired
 *     mid-session. 401 is the code the frontend's existing refresh-and-retry
 *     logic already watches for, so an expired staff session recovers
 *     silently; a genuine guest's refresh attempt just fails and the same
 *     401 surfaces one round-trip later — no worse than before, and 401
 *     ("authenticate to proceed") is the textbook-correct code for a request
 *     carrying no credentials at all regardless.
 *   - `req.user` present but not STAFF/ADMIN (403 FORBIDDEN, unchanged) — a
 *     genuinely authenticated, non-expired session that just isn't allowed
 *     this view. No retry would ever help here, so 403 stays exactly right.
 */
export function resolveListStatus(
  req: Request,
  status: CatalogListStatus | undefined,
  includeInactive?: boolean
): CatalogListStatus {
  const effective: CatalogListStatus = status ?? (includeInactive ? 'all' : 'active');
  if (effective !== 'active' && !isStaff(req)) {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Sign in as staff to list archived or inactive records.');
    }
    throw new AppError('FORBIDDEN', 'Only staff can list archived or inactive records.');
  }
  return effective;
}
