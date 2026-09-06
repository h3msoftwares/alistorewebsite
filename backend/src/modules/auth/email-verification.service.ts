import argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { sendVerificationEmail } from '../../lib/mailer';

// SHA-256 hex — same construction as auth.service.ts / password-reset.service.ts.
// Only the hash is stored, never the raw token, so a DB leak alone can't be
// replayed. Duplicated deliberately to keep this module self-contained; if it
// drifts from the others, that's a bug.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// A fixed input hashed on every resend call, whether or not the email resolves
// to an unverified account, so "exists / is unverified" can't be told apart by
// response time. Same principle as password-reset's TIMING_EQUALIZER_INPUT.
const TIMING_EQUALIZER_INPUT = 'email-verification-timing-equalizer';

/**
 * Mint a fresh single-use verification token for `userId` (invalidating any
 * outstanding unused ones) and fire off the email. Fire-and-forget: SMTP
 * latency or failure must never be observable via the caller's response.
 * Callers guarantee `email` belongs to `userId`.
 */
export async function issueAndSendVerification(
  userId: string,
  email: string,
  locale: string
): Promise<void> {
  const rawToken = randomBytes(32).toString('base64url'); // 256 bits
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_MIN * 60_000);

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userID: userId, usedAt: null } }),
    prisma.emailVerificationToken.create({ data: { userID: userId, tokenHash, expiresAt } }),
  ]);

  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  const verifyUrl = `${base}/${locale}/verify-email?token=${rawToken}`;

  void sendVerificationEmail(email, verifyUrl, env.EMAIL_VERIFICATION_TTL_MIN).catch((err) => {
    console.error('[verify-email] unexpected mailer error', err);
  });
}

/**
 * Consume a verification token. One generic error for "not found" / "expired"
 * / "already used" — same enumeration-resistance as reset-password. On success
 * the user's `emailVerified` is stamped and the token is marked used. Does NOT
 * log the user in — they go through normal login afterwards.
 */
export async function verifyEmail(token: string): Promise<void> {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  const valid = Boolean(record && !record.usedAt && record.expiresAt > new Date());
  if (!valid || !record) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired verification link');
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userID }, data: { emailVerified: new Date() } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

/**
 * Re-send a verification link. Silent no-op unless the email resolves to an
 * active, password-holding, still-unverified account — the controller returns
 * the same generic message either way, so this leaks nothing about which
 * emails have accounts (or which accounts are verified).
 */
export async function resendVerification(email: string, locale: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  // Unconditional — runs before the branch so both paths pay the same cost.
  await argon2.hash(TIMING_EQUALIZER_INPUT);

  if (!user || !user.isActive || !user.passwordHash || user.emailVerified) return;

  await issueAndSendVerification(user.id, user.email!, locale);
}
