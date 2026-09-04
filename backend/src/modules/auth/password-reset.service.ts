import argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { sendPasswordResetEmail } from '../../lib/mailer';

// Same construction as auth.service.ts's hashToken (SHA-256 hex) — never
// store the raw token, only this hash, so a DB leak alone can't be replayed.
// Duplicated rather than imported to keep this module self-contained; if it
// ever drifts from auth.service.ts's version, that's a bug — they must match.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// A fixed input hashed on every call, whether or not the email matches an
// account, so "exists" vs "doesn't" can't be told apart by response time.
// Same principle as admin-login's DUMMY_HASH — here there's no password to
// verify against, so the equivalent is an unconditional Argon2 hash op sized
// to the same cost as everywhere else in the app (default params).
const TIMING_EQUALIZER_INPUT = 'password-reset-timing-equalizer';

export async function requestPasswordReset(email: string, locale: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  // Unconditional — see TIMING_EQUALIZER_INPUT above. Runs before the
  // existence branch so both paths pay it.
  await argon2.hash(TIMING_EQUALIZER_INPUT);

  // Unknown email, inactive account, or an OAuth-only account with no
  // password to reset — silently no-op. No DB write, nothing sent, and the
  // caller (the controller) always returns the same response regardless.
  if (!user || !user.isActive || !user.passwordHash) return;

  const rawToken = randomBytes(32).toString('base64url'); // 256 bits
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.RESET_TOKEN_TTL_MIN * 60_000);

  await prisma.$transaction([
    // "Requesting again invalidates the previous unused token" — remove any
    // still-live ones instead of letting them pile up in this user's inbox
    // or in the table.
    prisma.passwordResetToken.deleteMany({ where: { userID: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({ data: { userID: user.id, tokenHash, expiresAt } }),
  ]);

  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  const resetUrl = `${base}/${locale}/reset-password?token=${rawToken}`;

  // Fire-and-forget: SMTP latency (or failure) must never affect the
  // response the caller gets, and must never be observable via timing.
  void sendPasswordResetEmail(user.email!, resetUrl, env.RESET_TOKEN_TTL_MIN).catch((err) => {
    console.error('[forgot-password] unexpected mailer error', err);
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  const valid = Boolean(record && !record.usedAt && record.expiresAt > new Date());
  if (!valid || !record) {
    // One error for "not found" / "already used" / "expired" — same
    // enumeration-resistance principle as admin-login's uniform rejection.
    throw new AppError('UNAUTHORIZED', 'Invalid or expired reset link');
  }

  const passwordHash = await argon2.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userID }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // A password reset is often a response to a compromise — kill every
    // existing session (every refresh token), not just future ones, so an
    // attacker who was already logged in gets logged out too.
    prisma.refreshToken.updateMany({
      where: { userID: record.userID, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
