import nodemailer from 'nodemailer';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { encryptSecret, decryptSecret } from '../../lib/secret-encryption';

const SMTP_CREDENTIAL_ID = 1;
const ENCRYPTION_LABEL = 'smtp-credential-app-password-v1';

// Gmail's own fixed endpoint — the "app password" concept this flow asks
// the admin for is specifically Gmail's, so host/port are not
// admin-configurable here (unlike SMTP_HOST/SMTP_PORT for the env fallback,
// which could in principle point anywhere).
const GMAIL_HOST = 'smtp.gmail.com';
const GMAIL_PORT = 587;

export interface EffectiveSmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

/**
 * DB row (admin-configured, via the admin panel) takes priority over the
 * SMTP_* env vars, once it exists — same pattern as DriveCredential /
 * drive.client.ts's getEffectiveConnection. A decryption failure (e.g. the
 * signing secret rotated) falls back to the env vars rather than throwing,
 * matching every mailer function's "never let mail infrastructure break the
 * calling request" contract; it's logged loudly so an admin notices mail
 * silently reverted to the old account.
 */
export async function getEffectiveSmtpConfig(): Promise<EffectiveSmtpConfig | null> {
  const row = await prisma.smtpCredential.findUnique({ where: { id: SMTP_CREDENTIAL_ID } });
  if (row?.user && row.encryptedPassword) {
    try {
      const password = decryptSecret(row.encryptedPassword, ENCRYPTION_LABEL);
      return { host: GMAIL_HOST, port: GMAIL_PORT, user: row.user, password };
    } catch (err) {
      console.error(
        '[smtp-credential] failed to decrypt the stored app password — falling back to env SMTP',
        err
      );
    }
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    return { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, password: env.SMTP_PASSWORD };
  }
  return null;
}

export interface SmtpStatus {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  user: string | null;
  updatedAt: string | null;
}

/** Everything the admin panel's "Outgoing mail account" card needs. Never
 *  returns the password — only whether something is configured and which
 *  address it sends as. */
export async function getStatus(): Promise<SmtpStatus> {
  const row = await prisma.smtpCredential.findUnique({ where: { id: SMTP_CREDENTIAL_ID } });
  if (row?.user && row.encryptedPassword) {
    return { configured: true, source: 'database', user: row.user, updatedAt: row.updatedAt.toISOString() };
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    return { configured: true, source: 'env', user: env.SMTP_USER, updatedAt: null };
  }
  return { configured: false, source: 'none', user: null, updatedAt: null };
}

/**
 * Sets the outgoing-mail account. Verifies the credentials with a real SMTP
 * handshake+auth (`transporter.verify()` — no email is sent) BEFORE
 * persisting anything, so a typo'd app password can't silently break every
 * outgoing email until someone notices; throws AppError('VALIDATION_ERROR')
 * on failure with Gmail's own rejection reason.
 */
export async function setCredential(user: string, appPassword: string, actorId: string): Promise<SmtpStatus> {
  const testTransport = nodemailer.createTransport({
    host: GMAIL_HOST,
    port: GMAIL_PORT,
    secure: false,
    auth: { user, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  try {
    await testTransport.verify();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown SMTP error';
    throw new AppError(
      'VALIDATION_ERROR',
      `Could not authenticate with that email and app password: ${message}`
    );
  }

  const encryptedPassword = encryptSecret(appPassword, ENCRYPTION_LABEL);
  const row = await prisma.smtpCredential.upsert({
    where: { id: SMTP_CREDENTIAL_ID },
    create: { id: SMTP_CREDENTIAL_ID, user, encryptedPassword, updatedByID: actorId },
    update: { user, encryptedPassword, updatedByID: actorId },
  });

  return { configured: true, source: 'database', user: row.user, updatedAt: row.updatedAt.toISOString() };
}

/** Clears the DB row, reverting outgoing mail to the SMTP_* env fallback (if
 *  any). Lower-risk than setCredential — it removes an override rather than
 *  handing anyone a new standing credential — so it isn't step-up gated. */
export async function clearCredential(actorId: string): Promise<SmtpStatus> {
  await prisma.smtpCredential.upsert({
    where: { id: SMTP_CREDENTIAL_ID },
    create: { id: SMTP_CREDENTIAL_ID, user: null, encryptedPassword: null, updatedByID: actorId },
    update: { user: null, encryptedPassword: null, updatedByID: actorId },
  });
  return getStatus();
}
