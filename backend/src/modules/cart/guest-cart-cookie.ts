import { randomUUID } from 'crypto';
import type { Response } from 'express';

/** Name of the cookie that identifies an anonymous shopper's cart. */
export const GUEST_CART_COOKIE = 'cartSession';

/**
 * Cookie attributes for the guest cart id. `path: '/'` (the default) on
 * purpose — both `/api/cart` and `/api/orders` read it, unlike the refresh
 * cookie which is scoped to `/api/auth`. httpOnly + SameSite=Strict: the
 * value is an opaque session id the client never needs to read, and it must
 * not ride along on cross-site requests.
 */
export const guestCartCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 1000 * 60 * 60 * 24 * 30,
};

/**
 * Issue a brand-new guest cart session id, overwriting whatever the client
 * presented. Used on login/register (S9 — session-fixation mitigation):
 * after the pre-login guest cart has been merged into the account, the id
 * the browser arrived with is rotated rather than merely cleared, so a
 * value an attacker may have pre-seeded is invalidated. Returns the fresh
 * id (callers generally ignore it).
 */
export function rotateGuestCartCookie(res: Response): string {
  const fresh = randomUUID();
  res.cookie(GUEST_CART_COOKIE, fresh, guestCartCookieOptions);
  return fresh;
}
