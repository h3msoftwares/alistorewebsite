// Short-lived, server-signed "state" for the Gmail-send connect flow — same
// pattern as backup/drive-state.ts, kept as its own file (own PURPOSE
// string) so a Drive-connect state token can never be replayed against this
// callback, or vice versa.

import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const PURPOSE = 'mail-gmail-connect';

export function signConnectState(adminId: string): string {
  return jwt.sign({ sub: adminId, purpose: PURPOSE }, env.JWT_ACCESS_SECRET, {
    expiresIn: '10m',
    algorithm: 'HS256',
  });
}

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
