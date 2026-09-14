import argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import {
  sendEmailChangeConfirmationEmail,
  sendEmailChangeRequestedNoticeEmail,
  sendEmailChangedNoticeEmail,
} from '../../lib/mailer';

// SHA-256 hex — same construction as auth.service.ts / email-verification.service.ts.
// Duplicated deliberately to keep this module self-contained.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Step 1 of Task 3: an ADMIN asks to change their own account email
 * (role-gated in email-change.routes.ts — not a general customer/STAFF
 * feature). Requires the CURRENT password (same re-auth bar as
 * changePassword — a valid session alone is not enough), and never applies
 * the change immediately: a confirmation link is sent to the NEW address,
 * and only clicking it (confirmEmailChange below) actually updates
 * `User.email`.
 *
 * Enumeration-resistant the same way register() is: if `newEmail` already
 * belongs to a DIFFERENT account, this silently does nothing beyond the
 * notice to the old address — no request row, no confirmation email — but
 * still returns normally, so a hijacked/borrowed session can't be used to
 * probe which email addresses have accounts on this store.
 *
 * The OLD address is also notified that a change was requested (before it's
 * confirmed) — defense-in-depth: the real owner finds out even if a
 * hijacked session made the request, in time to react before the new
 * address ever confirms it.
 */
export async function requestEmailChange(
  userId: string,
  newEmail: string,
  currentPassword: string,
  locale: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !user.passwordHash || user.deletedAt) {
    throw new AppError('UNAUTHORIZED', 'Invalid credentials');
  }

  const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
  if (!ok) {
    throw new AppError('VALIDATION_ERROR', 'Current password is incorrect');
  }

  if (user.email && user.email.toLowerCase() === newEmail.toLowerCase()) {
    throw new AppError('VALIDATION_ERROR', 'That is already your current email address');
  }

  const conflict = await prisma.user.findFirst({
    where: { email: newEmail, deletedAt: null, id: { not: userId } },
  });
  if (conflict) {
    // Enumeration-resistant no-op — see the doc comment above. Still notify
    // the old address: an attacker fishing for taken emails via a hijacked
    // session is exactly the scenario that notice defends against.
    if (user.email) {
      void sendEmailChangeRequestedNoticeEmail(user.email, newEmail).catch((err) => {
        console.error('[email-change] unexpected mailer error (conflict-path notice)', err);
      });
    }
    return;
  }

  const rawToken = randomBytes(32).toString('base64url'); // 256 bits
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.EMAIL_CHANGE_TTL_MIN * 60_000);

  await prisma.$transaction([
    // Only this account's own outstanding requests — never touches another
    // user's rows even though tokenHash collisions are cryptographically
    // impossible anyway.
    prisma.emailChangeRequest.deleteMany({ where: { userID: userId, usedAt: null } }),
    prisma.emailChangeRequest.create({ data: { userID: userId, newEmail, tokenHash, expiresAt } }),
  ]);

  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  const confirmUrl = `${base}/${locale}/confirm-email-change?token=${rawToken}`;

  void sendEmailChangeConfirmationEmail(newEmail, confirmUrl, env.EMAIL_CHANGE_TTL_MIN).catch((err) => {
    console.error('[email-change] unexpected mailer error (confirmation)', err);
  });
  if (user.email) {
    void sendEmailChangeRequestedNoticeEmail(user.email, newEmail).catch((err) => {
      console.error('[email-change] unexpected mailer error (request notice)', err);
    });
  }
}

/**
 * Step 2: consume a confirmation token from the link sent to the NEW
 * address. One generic error for "not found" / "expired" / "already used" —
 * same enumeration-resistance shape as verifyEmail. On success:
 *   - `User.email` is replaced and `emailVerified` re-stamped (they just
 *     proved control of the new address);
 *   - every existing refresh token for the account is revoked — a change to
 *     the account's identity ends all other sessions, same as changePassword;
 *   - the OLD address (captured before the update) gets a final notice.
 * Re-checks the uniqueness race at confirm time too — the window between
 * request and confirm could be minutes or hours, long enough for the address
 * to have been claimed by someone else in the meantime.
 */
export async function confirmEmailChange(token: string): Promise<void> {
  const record = await prisma.emailChangeRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  const valid = Boolean(record && !record.usedAt && record.expiresAt > new Date() && !record.user.deletedAt);
  if (!valid || !record) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired confirmation link');
  }

  const conflict = await prisma.user.findFirst({
    where: { email: record.newEmail, deletedAt: null, id: { not: record.userID } },
  });
  if (conflict) {
    // Mark used regardless — a stale/raced token must not be retriable.
    await prisma.emailChangeRequest.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    throw new AppError('CONFLICT', 'That email address is no longer available');
  }

  const oldEmail = record.user.email;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userID },
      data: { email: record.newEmail, emailVerified: new Date() },
    }),
    prisma.emailChangeRequest.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userID: record.userID, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  if (oldEmail) {
    void sendEmailChangedNoticeEmail(oldEmail, record.newEmail).catch((err) => {
      console.error('[email-change] unexpected mailer error (changed notice)', err);
    });
  }
}
