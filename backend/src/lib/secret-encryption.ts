import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { env } from '../config/env';

/**
 * Generic AES-256-GCM encryption for standing credentials stored at rest in
 * the database (currently: the admin-configured SMTP app password — see
 * modules/settings/smtp-credential.service.ts). Unlike the Google Drive
 * refresh token (useless without also knowing the OAuth client secret, and
 * revocable at Google), a credential encrypted here works the instant it's
 * read, so DB access control alone isn't enough — it gets real encryption.
 *
 * The key is derived from JWT_ACCESS_SECRET (already strong-secret-asserted
 * in production — see config/env.ts) via HMAC-SHA256 with a caller-supplied
 * domain-separation label, so no new required env var/secret is needed —
 * same technique already used for the CSRF signing key (see
 * middleware/csrf.middleware.ts). Different labels never collide even
 * though they share the same root secret.
 */
function deriveKey(label: string): Buffer {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(label).digest();
}

const IV_LENGTH = 12; // GCM standard nonce size

/** Encrypts `plaintext` under `label`, returning `iv.authTag.ciphertext`
 *  (each base64url) as a single string safe to store in a text column. */
export function encryptSecret(plaintext: string, label: string): string {
  const key = deriveKey(label);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64url')).join('.');
}

/** Reverses `encryptSecret`. Throws on a malformed value, a label/key
 *  mismatch, or a tampered ciphertext (GCM auth-tag check) — callers must
 *  not silently swallow this into "treat as unconfigured" without logging. */
export function decryptSecret(packed: string, label: string): string {
  const key = deriveKey(label);
  const [ivB64, tagB64, dataB64] = packed.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret');
  }
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
