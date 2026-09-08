import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { AuthedUser } from '../../middleware/auth.middleware';
import { issueAndSendVerification } from './email-verification.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Account lockout (see Alistore_Schema_Changes_Discussion.md §1.2 / Sprint T18).
const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

// A fixed, valid Argon2 hash to verify against when the identifier matches no
// usable account. Verifying always (real hash or this one) keeps response time
// for "unknown identifier" close to "wrong password", so timing can't be used
// to enumerate which emails/phones have accounts. Shared with the admin-login
// flow (admin-auth.service.ts) so both doors pay the same cost.
export const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$94YlQu8bWedZruZ1me8oyg$n8cfI3WUrts585489wFM2zRvAfR49HamTnoM6PNPD64';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type CustomerLoginOutcome =
  | 'success'
  | 'invalid_credentials'
  | 'locked_out'
  | 'privileged_denied' // correct creds, but an ADMIN/STAFF account — must use the admin door
  | 'email_unverified'; // correct creds, but the email was never verified

export interface LoginContext {
  ip: string;
  userAgent: string;
}

/** Append-only audit row for every terminal login path. Mirrors admin-login's
 *  `recordAttempt` (action prefix `customer_login.` vs `admin_login.`). A
 *  write failure must never change or reveal the login result — swallowed. */
async function recordLoginAttempt(
  outcome: CustomerLoginOutcome,
  identifier: string,
  ctx: LoginContext,
  matchedUserId: string | null
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: 'auth',
        entityID: matchedUserId,
        action: `customer_login.${outcome}`,
        actorID: outcome === 'success' ? matchedUserId : null,
        metadata: { identifier, ip: ctx.ip, userAgent: ctx.userAgent, outcome },
      },
    });
  } catch (err) {
    console.error('[login] audit-log write failed', err);
  }
}

const PRIVILEGED_ROLES: AuthedUser['role'][] = ['ADMIN', 'STAFF'];

// Exported so the admin-login flow (modules/auth/admin-auth.service.ts) issues
// the exact same token pair as customer login instead of forking the crypto.
// TTL is derived from the *role*, not from which endpoint minted the token, so
// a STAFF/ADMIN always gets the shorter admin TTL — including on silent
// refresh, where refresh() re-signs with the account's current role.
//
// `authTimeSec` is the epoch-seconds moment a password was last verified for
// this login (see the RefreshToken.authTime column). It is embedded as the
// `auth_time` claim and is what requireFreshAuth() checks for step-up
// -protected routes. Every caller passes it explicitly — a silent refresh
// carries the *original* value forward, so keeping a session alive never
// makes it look freshly authenticated.
export function signAccessToken(user: AuthedUser, authTimeSec: number) {
  const expiresIn = PRIVILEGED_ROLES.includes(user.role)
    ? env.JWT_ADMIN_ACCESS_TTL
    : env.JWT_ACCESS_TTL;
  return jwt.sign(
    { id: user.id, role: user.role, auth_time: authTimeSec },
    env.JWT_ACCESS_SECRET,
    { expiresIn } as jwt.SignOptions
  );
}

// Returns the raw JWT plus the stored row (id links a rotated token back to
// its predecessor; authTime is carried forward by refresh()).
export async function issueRefreshToken(
  userID: string,
  opts: { familyID?: string; authTime?: Date } = {}
): Promise<{ token: string; id: string; authTime: Date }> {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userID, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  } as jwt.SignOptions);

  // Stored hashed (not the raw JWT) so a DB leak alone can't be replayed.
  // This is the Postgres-backed equivalent of the Redis `refresh:<jti>` key
  // pos-backend used — no Redis needed at this scale.
  // `familyID` groups a rotation chain: a fresh login starts a new family, a
  // rotation carries the parent's family so a detected replay can revoke the
  // whole chain at once. `authTime` defaults to now (a fresh login / step-up)
  // and is passed through explicitly on rotation.
  const record = await prisma.refreshToken.create({
    data: {
      userID,
      familyID: opts.familyID ?? randomUUID(),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      ...(opts.authTime ? { authTime: opts.authTime } : {}),
    },
  });
  return { token, id: record.id, authTime: record.authTime };
}

const toEpochSec = (d: Date) => Math.floor(d.getTime() / 1000);

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  address: {
    phone: string;
    addressLine: string;
    city: string;
    region?: string;
    area?: string;
    notes?: string;
  };
  locale: string;
}

/**
 * Enumeration-safe registration. The controller ALWAYS responds with the same
 * generic 201 message regardless of which branch runs here — and an argon2
 * hash of the submitted password runs on every path so timing doesn't leak
 * which one fired. Never issues a session: the new user verifies their email,
 * then logs in normally.
 *
 *  - brand-new email                -> create user (unverified) + default
 *                                      address + token, mail the link
 *  - existing UNVERIFIED email      -> re-issue a fresh token + mail it
 *                                      (helps a user who lost the first email;
 *                                      indistinguishable from the "new" case)
 *  - existing VERIFIED email        -> do nothing
 */
export async function register(input: RegisterInput): Promise<void> {
  // Always — timing equaliser. Also the hash we store on the happy path.
  const passwordHash = await argon2.hash(input.password);

  const existing = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
  });

  if (existing) {
    // The only branch that does anything: an unverified, usable account may
    // get a fresh link.
    if (!existing.emailVerified && existing.isActive && existing.passwordHash) {
      await issueAndSendVerification(existing.id, existing.email!, input.locale);
    }
    return;
  }

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: 'CUSTOMER',
          // emailVerified stays null — unverified until they click the link
        },
      });
      await tx.address.create({
        data: {
          userID: created.id,
          // The recipient defaults to the account holder; editable per-address
          // later from /account.
          fullName: input.name,
          phone: input.address.phone,
          addressLine: input.address.addressLine,
          city: input.address.city,
          region: input.address.region ?? null,
          area: input.address.area ?? null,
          notes: input.address.notes ?? null,
          isDefault: true,
        },
      });
      return created;
    });
  } catch (e) {
    // Lost a race to a concurrent registration for the same email — same
    // generic response as the "already exists" path.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
    throw e;
  }

  await issueAndSendVerification(user.id, user.email!, input.locale);
}

/**
 * Verify customer credentials. Hardened the same way as admin-login:
 *   - an Argon2 verify runs on every call (real hash or DUMMY_HASH) so an
 *     unknown identifier can't be told from a wrong password by timing;
 *   - every failure — unknown identifier, wrong password, locked-out, or a
 *     privileged account — throws the same generic `UNAUTHORIZED / "Invalid
 *     credentials"` (the old `FORBIDDEN / "Account temporarily locked"` leaked
 *     that the account exists);
 *   - ADMIN/STAFF accounts are refused outright: privileged credentials have
 *     exactly one door (POST /api/auth/ali-admin-login — audited, tighter rate
 *     limit, role gate). Refusing here also means this looser public endpoint
 *     can't be used to drive a privileged account's shared `failedLoginAttempts`
 *     up and lock it out of the admin panel;
 *   - the per-account lockout (5 tries / 15 min) is unchanged for customers;
 *   - every attempt is written to the audit log with its specific outcome.
 * The guest-cart merge still happens in the controller after a success.
 */
export async function login(
  identifier: string,
  password: string,
  ctx: LoginContext
): Promise<TokenPair & { userId: string }> {
  // Emails are stored lower-cased (auth.schema.ts); match case-insensitively
  // so a shopper can type "Foo@X.com". Lower-casing a phone number is a no-op.
  // The raw `identifier` is still what gets written to the audit log.
  const lookup = identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: lookup }, { phone: lookup }], deletedAt: null },
  });

  const loginable = Boolean(user?.isActive && user?.passwordHash);
  const passwordValid = await argon2
    .verify(loginable ? user!.passwordHash! : DUMMY_HASH, password)
    .catch(() => false);

  const now = new Date();

  // 1. A privileged account has no business at the customer door — refuse
  //    without touching its lock counters, whether or not the password was
  //    right (the Argon2 verify above already equalised timing). Same generic
  //    rejection, so this can't be used as an "is X an admin?" oracle.
  if (user && PRIVILEGED_ROLES.includes(user.role)) {
    await recordLoginAttempt('privileged_denied', identifier, ctx, user.id);
    throw new AppError('UNAUTHORIZED', 'Invalid credentials');
  }

  // 2. A lock already stands — reject without advancing the counter.
  if (user?.lockedUntil && user.lockedUntil > now) {
    await recordLoginAttempt('locked_out', identifier, ctx, user.id);
    throw new AppError('UNAUTHORIZED', 'Invalid credentials');
  }

  // 3. No usable account, or wrong password. Advance the failure counter (and
  //    lock at the threshold) only for a real, active account.
  if (!user || !loginable || !passwordValid) {
    if (user && loginable) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil:
            attempts >= LOCK_THRESHOLD ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
        },
      });
    }
    await recordLoginAttempt('invalid_credentials', identifier, ctx, user?.id ?? null);
    throw new AppError('UNAUTHORIZED', 'Invalid credentials');
  }

  // 3b. Correct password, active CUSTOMER — but the email was never verified.
  //     A specific message is fine here (and better UX): the caller has
  //     already proven the password, so telling *them* "verify your email"
  //     reveals nothing to anyone who doesn't have it. The frontend surfaces
  //     a "resend verification" action off this.
  if (!user.emailVerified) {
    await recordLoginAttempt('email_unverified', identifier, ctx, user.id);
    throw new AppError('FORBIDDEN', 'Please verify your email address before signing in.');
  }

  // 4. Success — clear any stale counter, issue the token pair.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  // Fresh login → fresh auth_time (a password was just verified).
  const authTime = new Date();
  const { token: refreshToken } = await issueRefreshToken(user.id, { authTime });
  const accessToken = signAccessToken({ id: user.id, role: user.role }, toEpochSec(authTime));
  await recordLoginAttempt('success', identifier, ctx, user.id);
  return { accessToken, refreshToken, userId: user.id };
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  let payload: { sub: string; jti: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'], // pin — never let the token's own header pick the alg
    }) as { sub: string; jti: string };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError('UNAUTHORIZED', 'Refresh token has been revoked or expired');
  }

  // Reuse detection: this token was already rotated once (or explicitly
  // revoked). Presenting it again means the credential was replayed — kill
  // every still-live token in its rotation family, not just this one.
  if (stored.replacedByTokenID || stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyID: stored.familyID, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError('UNAUTHORIZED', 'Refresh token reuse detected — all sessions for this login have been revoked');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.deletedAt) {
    throw new AppError('UNAUTHORIZED', 'User no longer active');
  }

  // Rotate: issue the successor in the same family, then point the old row at
  // it and revoke it. `authTime` is carried forward UNCHANGED — a silent
  // refresh proves the session is alive, not that a password was re-entered.
  const { token: newRefreshToken, id: newTokenID } = await issueRefreshToken(user.id, {
    familyID: stored.familyID,
    authTime: stored.authTime,
  });
  const accessToken = signAccessToken({ id: user.id, role: user.role }, toEpochSec(stored.authTime));
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedByTokenID: newTokenID },
  });
  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Step-up re-authentication (S2). A signed-in user re-enters their password
 * to unlock a sensitive action (see requireFreshAuth). Verifies the password
 * with Argon2, then starts a BRAND-NEW refresh family with a fresh
 * `authTime` — deliberately without revoking the old family, so other tabs /
 * devices stay logged in (this is a re-auth prompt, not a logout). The
 * browser's refresh cookie is overwritten with the new family's token, so
 * every tab converges on the fresh authTime at its next silent refresh.
 */
export async function stepUp(userId: string, password: string): Promise<TokenPair> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !user.passwordHash || user.deletedAt) {
    throw new AppError('UNAUTHORIZED', 'Invalid credentials');
  }
  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok) {
    throw new AppError('VALIDATION_ERROR', 'Password is incorrect');
  }

  const authTime = new Date();
  const { token: refreshToken } = await issueRefreshToken(user.id, { authTime });
  const accessToken = signAccessToken({ id: user.id, role: user.role }, toEpochSec(authTime));
  return { accessToken, refreshToken };
}

/**
 * Change the password for a signed-in user.
 *   - the current password is verified with Argon2 — a valid session alone
 *     is not enough (defends a hijacked/borrowed session);
 *   - on success every existing refresh token for the account is revoked
 *     (same as a reset — a credential change ends all other sessions), then
 *     a fresh pair is issued for the calling browser;
 *   - any stale lockout counter is cleared.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<TokenPair> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !user.passwordHash || user.deletedAt) {
    throw new AppError('UNAUTHORIZED', 'Invalid credentials');
  }

  const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
  if (!ok) {
    throw new AppError('VALIDATION_ERROR', 'Current password is incorrect');
  }

  const passwordHash = await argon2.hash(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.refreshToken.updateMany({
      where: { userID: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  // A password was just verified → fresh auth_time.
  const authTime = new Date();
  const { token: refreshToken } = await issueRefreshToken(user.id, { authTime });
  const accessToken = signAccessToken({ id: user.id, role: user.role }, toEpochSec(authTime));
  return { accessToken, refreshToken };
}

export async function logout(refreshToken: string): Promise<void> {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (stored) {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  }
}
