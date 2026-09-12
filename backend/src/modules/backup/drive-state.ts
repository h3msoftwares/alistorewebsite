// Short-lived, server-signed "state" for the Google Drive connect flow.
// Google's redirect back to our callback is a plain top-level browser GET
// with no Authorization header and no way to attach our SPA's in-memory
// access token — this substitutes for the usual requireAuth/requireRole
// check on that one unauthenticated-looking route, while still proving the
// flow was started seconds ago by a real, already-authenticated ADMIN.

import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const PURPOSE = 'backup-drive-connect';

export function signConnectState(adminId: string): string {
  return jwt.sign({ sub: adminId, purpose: PURPOSE }, env.JWT_ACCESS_SECRET, {
    expiresIn: '10m',
    algorithm: 'HS256',
  });
}

/** @returns the admin id embedded in the state, or null if it's missing,
 *  expired, or wasn't minted by signConnectState. Pins `algorithms` (same as
 *  auth.middleware.ts's verifyAccessToken) so a token can't be forged by
 *  picking a different algorithm (e.g. `none`, or an asymmetric alg the
 *  attacker controls the "public key" input for). */
export function verifyConnectState(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as {
      sub?: string;
      purpose?: string;
    };
    if (payload.purpose !== PURPOSE || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
