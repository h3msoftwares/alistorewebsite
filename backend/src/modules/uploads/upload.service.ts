import { randomUUID, createHmac } from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';

// Comfortably inside ImageKit's accepted window; long enough that a slow
// upload (big image, slow connection) doesn't race the token's expiry.
const EXPIRE_SECONDS = 30 * 60;

export interface ImageKitAuthParams {
  token: string;
  expire: number;
  signature: string;
}

/**
 * Signs a short-lived ImageKit upload token so the admin UI's uploader can
 * push a file straight from the browser to ImageKit without the private key
 * ever leaving this server. Implements ImageKit's client-side-upload
 * signature scheme by hand — HMAC-SHA1 of `token + expire`, keyed on the
 * private key (see ImageKit's "Client-side file upload" API docs) — small
 * enough not to justify pulling in their SDK.
 */
export function getImageKitAuthParams(): ImageKitAuthParams {
  if (!env.IMAGEKIT_PRIVATE_KEY) {
    throw new AppError('INTERNAL', 'Image uploads are not configured (IMAGEKIT_PRIVATE_KEY is unset).');
  }
  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + EXPIRE_SECONDS;
  const signature = createHmac('sha1', env.IMAGEKIT_PRIVATE_KEY).update(token + expire).digest('hex');
  return { token, expire, signature };
}
