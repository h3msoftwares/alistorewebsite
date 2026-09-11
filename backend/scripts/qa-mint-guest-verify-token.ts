/**
 * Mints an already-verified CheckoutOtp ticket directly in the DB for a
 * given email, mirroring exactly the row shape checkout-otp.service.ts's
 * verifyOtp() produces on a correct code. For QA scripting guest checkout
 * flows without depending on real SMTP delivery / hCaptcha — this repo's
 * local dev SMTP is flaky (seen ETIMEDOUT in the dev log), and there's no
 * way to read a real inbox from here. Reproduces the exact server-side
 * effect of "guest entered the right code", nothing more.
 *
 *   npx tsx scripts/qa-mint-guest-verify-token.ts <email>
 *
 * Prints the raw verifyToken to pass as `emailVerifyToken` in a checkout
 * body.
 */
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../src/config/prisma';

const email = process.argv[2];
if (!email) {
  console.error('usage: qa-mint-guest-verify-token.ts <email>');
  process.exit(1);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  const verifyToken = randomBytes(32).toString('base64url');
  const verifyTokenHash = hash(verifyToken);
  await prisma.checkoutOtp.create({
    data: {
      email,
      codeHash: hash('000000'), // never checked once verifiedAt is set
      codeExpiresAt: new Date(Date.now() + 5 * 60_000),
      verifiedAt: new Date(),
      verifyTokenHash,
      verifyTokenExpiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });
  console.log(verifyToken);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
