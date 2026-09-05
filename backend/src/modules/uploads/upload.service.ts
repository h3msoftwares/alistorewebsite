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

/**
 * Deletes a file from ImageKit's Media Library by id, via its Media API
 * (Basic Auth: private key as username, empty password — same credential
 * used to sign uploads, never the browser-facing public key). Best-effort:
 * catalog image rows are the source of truth for the app, so a failure here
 * (network blip, already-deleted file, misconfigured key) is logged and
 * swallowed rather than blocking the caller's own delete.
 */
export async function deleteImageKitFile(fileId: string): Promise<void> {
  if (!env.IMAGEKIT_PRIVATE_KEY) return;
  try {
    const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`,
      },
    });
    // 404 = already gone (e.g. deleted directly in the ImageKit dashboard) — not an error for us.
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => '');
      console.error(`[imagekit] failed to delete file ${fileId}: ${res.status} ${body}`);
    }
  } catch (e) {
    console.error(`[imagekit] failed to delete file ${fileId}`, e);
  }
}
