/**
 * Mints access tokens directly (via the app's own signAccessToken(), same
 * secret/claim shape as a real login) for the qatest_flash_* accounts, and
 * writes { email, token } pairs to a JSON file.
 *
 * Why not just log in via POST /api/auth/login N times: the customer login
 * route is deliberately rate-limited (~20/15min per IP) as a real security
 * control — correct, and not what TEST_PLAN.md 1.8 is testing. 1.8 is about
 * checkout concurrency for N already-logged-in shoppers, not login
 * concurrency, so this mints sessions the same way login would without
 * tripping a control that's out of scope for this test.
 *
 *   npx tsx scripts/qa-mint-flash-tokens.ts <count> <outFile>
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/config/prisma';
import { signAccessToken } from '../src/modules/auth/auth.service';

const COUNT = Number(process.argv[2] ?? 50);
const OUT_FILE = process.argv[3] ?? 'flash-tokens.json';

async function main() {
  const emails = Array.from({ length: COUNT }, (_, i) => `qatest_flash_${String(i + 1).padStart(3, '0')}@qatest.local`);
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, role: true } });
  if (users.length !== COUNT) {
    throw new Error(`expected ${COUNT} qatest_flash_* users, found ${users.length} — run qa-seed-flash-buyers.ts first`);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const pairs = users.map((u) => ({
    email: u.email,
    token: signAccessToken({ id: u.id, role: u.role as 'CUSTOMER' }, nowSec),
  }));
  writeFileSync(OUT_FILE, JSON.stringify(pairs, null, 2));
  console.log(`[qa-mint-flash-tokens] wrote ${pairs.length} tokens to ${OUT_FILE}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
