/**
 * Mints an access token directly (via the app's own signAccessToken(), same
 * secret/claim shape as a real login) for one user by email. For QA
 * scripting after tripping the (correctly-working) login rate limiter
 * through repeated test runs — not a bypass of authorization, just of the
 * per-IP login throttle, which isn't what the test at hand is exercising.
 *
 *   npx tsx scripts/qa-mint-token.ts <email>
 */
import { prisma } from '../src/config/prisma';
import { signAccessToken } from '../src/modules/auth/auth.service';

const email = process.argv[2];
if (!email) {
  console.error('usage: qa-mint-token.ts <email>');
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) throw new Error(`no user with email ${email}`);
  const nowSec = Math.floor(Date.now() / 1000);
  console.log(signAccessToken({ id: user.id, role: user.role }, nowSec));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
