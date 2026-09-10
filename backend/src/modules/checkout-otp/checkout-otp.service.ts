import { randomBytes, randomInt, createHash } from 'crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { verifyCaptcha } from '../../lib/captcha';
import { sendCheckoutOtpEmail } from '../../lib/mailer';
import { isBlacklisted } from '../blacklist/blacklist.service';

// Same construction as auth.service.ts / password-reset.service.ts — only
// the hash is ever stored, never the raw code or ticket.
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const CODE_TTL_MIN = 5;
const TICKET_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

const EMAIL_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_MAX_PER_WINDOW = 3;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_PER_WINDOW = 10;
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;

// Same generic message for a blacklist hit and a rate-limit hit — a blocked
// address can't be distinguished from "just rate-limited" by probing.
const REQUEST_THROTTLED = 'Unable to send a code right now. Try again later.';

function cleanupOldRows(): void {
  void prisma.checkoutOtp
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - CLEANUP_AGE_MS) } } })
    .catch((err) => console.error('[checkout-otp] cleanup failed', err));
}

/**
 * Requests a checkout email-OTP: verifies the CAPTCHA, checks the
 * blacklist, enforces DB-backed per-email/per-IP rate limits (no Redis —
 * plain indexed queries against this table), then generates and emails a
 * 6-digit code. Throws AppError on any rejection; the email send itself is
 * awaited (unlike order-confirmation email) since it's the actual
 * deliverable of this endpoint.
 */
export async function requestOtp(email: string, captchaToken: string, requestIP: string | undefined): Promise<void> {
  const captchaOk = await verifyCaptcha(captchaToken, requestIP);
  if (!captchaOk) {
    throw new AppError('VALIDATION_ERROR', 'Captcha verification failed');
  }

  if (await isBlacklisted('EMAIL', email)) {
    throw new AppError('RATE_LIMITED', REQUEST_THROTTLED);
  }
  if (requestIP && (await isBlacklisted('IP', requestIP))) {
    throw new AppError('RATE_LIMITED', REQUEST_THROTTLED);
  }
  // A registered CUSTOMER an admin blocked from the Customers page (isActive
  // false): don't let them start the guest email-OTP flow to check out under
  // their own address. Same generic response as the blacklist hit above —
  // order.service.ts refuses the checkout itself too, this just stops it
  // earlier and without a distinguishing error.
  const blockedCustomer = await prisma.user.findFirst({
    where: { role: 'CUSTOMER', isActive: false, deletedAt: null, email: email.toLowerCase() },
    select: { id: true },
  });
  if (blockedCustomer) {
    throw new AppError('RATE_LIMITED', REQUEST_THROTTLED);
  }

  const now = Date.now();

  const lastForEmail = await prisma.checkoutOtp.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (lastForEmail && now - lastForEmail.createdAt.getTime() < EMAIL_COOLDOWN_MS) {
    throw new AppError('RATE_LIMITED', REQUEST_THROTTLED);
  }

  const [emailCount, ipCount] = await Promise.all([
    prisma.checkoutOtp.count({
      where: { email, createdAt: { gt: new Date(now - EMAIL_WINDOW_MS) } },
    }),
    requestIP
      ? prisma.checkoutOtp.count({
          where: { requestIP, createdAt: { gt: new Date(now - IP_WINDOW_MS) } },
        })
      : Promise.resolve(0),
  ]);
  if (emailCount >= EMAIL_MAX_PER_WINDOW || ipCount >= IP_MAX_PER_WINDOW) {
    throw new AppError('RATE_LIMITED', REQUEST_THROTTLED);
  }

  const code = randomInt(100000, 1000000).toString();
  const codeHash = hash(code);
  const codeExpiresAt = new Date(now + CODE_TTL_MIN * 60_000);

  await prisma.checkoutOtp.create({
    data: { email, codeHash, codeExpiresAt, requestIP: requestIP ?? null },
  });

  cleanupOldRows();

  const sent = await sendCheckoutOtpEmail(email, code, CODE_TTL_MIN);
  if (!sent) {
    throw new AppError('INTERNAL', 'Could not send verification code. Try again later.');
  }
}

/**
 * Verifies a checkout email-OTP code. On success mints a short-lived
 * "verified" ticket (verifyToken) for checkout to redeem, and — if the
 * caller is logged in and this is their own account email — stamps
 * User.emailVerified, since they've just proven they control that inbox.
 */
export async function verifyOtp(
  email: string,
  code: string,
  userId: string | undefined
): Promise<{ verifyToken: string }> {
  const record = await prisma.checkoutOtp.findFirst({
    where: { email, codeExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  // One generic error for "no live code" / "too many wrong tries" / "wrong
  // code" — same enumeration-resistance principle as password-reset.
  const INVALID = new AppError('UNAUTHORIZED', 'Invalid or expired code');

  if (!record || record.attempts >= MAX_ATTEMPTS) {
    throw INVALID;
  }

  if (hash(code) !== record.codeHash) {
    await prisma.checkoutOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw INVALID;
  }

  const verifyToken = randomBytes(32).toString('base64url');
  const verifyTokenHash = hash(verifyToken);
  const verifyTokenExpiresAt = new Date(Date.now() + TICKET_TTL_MIN * 60_000);

  await prisma.checkoutOtp.update({
    where: { id: record.id },
    data: { verifiedAt: new Date(), verifyTokenHash, verifyTokenExpiresAt },
  });

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
    if (user && user.email === email && !user.emailVerified) {
      await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
    }
  }

  return { verifyToken };
}
