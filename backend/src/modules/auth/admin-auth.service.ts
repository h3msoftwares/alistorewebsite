import argon2 from 'argon2';
import type { User } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { signAccessToken, issueRefreshToken, DUMMY_HASH } from './auth.service';

// Admin login locks sooner-relative and longer than customer login: 5 wrong
// tries is a clear "not a typo" signal, and a 30-minute cool-down (vs. the
// customer flow's 15) halves an attacker's sustained guess rate against what
// is the app's highest-value credential. The lock lives on the shared User
// row, so a brute-forced admin is refused at BOTH doors until it expires or an
// operator clears `lockedUntil` in the DB. Trade-off: someone who knows an
// admin's email can grief that admin into a temporary lockout — acceptable
// because it auto-expires, the per-IP rate limit caps how fast it can be
// triggered, and manual unlock is a one-line UPDATE.
const ADMIN_LOCK_THRESHOLD = 5;
const ADMIN_LOCK_MINUTES = 30;

// Timing-equaliser hash for "no usable account" is shared with customer login
// (auth.service.ts DUMMY_HASH) so both doors pay the same Argon2 cost.

export type AdminLoginOutcome = 'success' | 'invalid_credentials' | 'not_admin' | 'locked_out';

export interface AdminLoginContext {
  ip: string;
  userAgent: string;
}

export interface AdminLoginSuccess {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Every terminal path — success and each failure kind — lands here. Writes to
 *  the existing `AuditLog` model (append-only, no schema change needed). A
 *  failure to write the audit row must never change or reveal the login
 *  result, so it's swallowed with a console error. */
async function recordAttempt(
  outcome: AdminLoginOutcome,
  identifier: string,
  ctx: AdminLoginContext,
  matchedUserId: string | null
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: 'auth',
        entityID: matchedUserId,
        action: `admin_login.${outcome}`,
        actorID: outcome === 'success' ? matchedUserId : null,
        metadata: { identifier, ip: ctx.ip, userAgent: ctx.userAgent, outcome },
      },
    });
  } catch (err) {
    console.error('[admin-login] audit-log write failed', err);
  }
}

function invalidCredentials() {
  // One error for every failure mode — unknown identifier, wrong password,
  // correct password but wrong role, and locked-out all return this, so a
  // caller can't tell them apart.
  return new AppError('UNAUTHORIZED', 'Invalid credentials');
}

async function clearLockState(user: Pick<User, 'id' | 'failedLoginAttempts' | 'lockedUntil'>) {
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }
}

/**
 * Verify credentials for the admin panel. On success returns the same access +
 * refresh token pair as customer login. On any failure throws a generic
 * `UNAUTHORIZED / "Invalid credentials"`. An Argon2 verify runs on every call.
 * Every attempt is audited with its specific outcome.
 */
export async function adminLogin(
  identifier: string,
  password: string,
  ctx: AdminLoginContext
): Promise<AdminLoginSuccess> {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }], deletedAt: null },
  });

  const loginable = Boolean(user?.isActive && user?.passwordHash);
  const passwordValid = await argon2
    .verify(loginable ? user!.passwordHash! : DUMMY_HASH, password)
    .catch(() => false);

  const now = new Date();

  // 1. A lock already stands — reject without advancing the counter.
  if (user?.lockedUntil && user.lockedUntil > now) {
    await recordAttempt('locked_out', identifier, ctx, user.id);
    throw invalidCredentials();
  }

  // 2. No usable account, or the password is wrong. Advance the failure
  //    counter (and lock at the threshold) only for a real, active account.
  if (!user || !loginable || !passwordValid) {
    if (user && loginable) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil:
            attempts >= ADMIN_LOCK_THRESHOLD
              ? new Date(now.getTime() + ADMIN_LOCK_MINUTES * 60_000)
              : null,
        },
      });
    }
    await recordAttempt('invalid_credentials', identifier, ctx, user?.id ?? null);
    throw invalidCredentials();
  }

  // 3. Correct password, but not a STAFF/ADMIN account. The credential is
  //    valid (just for the wrong door), so clear any stale counter but do not
  //    lock — then reject exactly like every other failure.
  if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
    await clearLockState(user);
    await recordAttempt('not_admin', identifier, ctx, user.id);
    throw invalidCredentials();
  }

  // 4. Success. Fresh login → fresh auth_time for step-up checks.
  await clearLockState(user);
  const authTime = new Date();
  const { token: refreshToken } = await issueRefreshToken(user.id, { authTime });
  const accessToken = signAccessToken({ id: user.id, role: user.role }, Math.floor(authTime.getTime() / 1000));
  await recordAttempt('success', identifier, ctx, user.id);
  return { accessToken, refreshToken, userId: user.id };
}
