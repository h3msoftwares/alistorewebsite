/**
 * QA stress-test fixture — N throwaway verified CUSTOMER accounts for
 * TEST_PLAN.md 1.8 (flash-sale simulation). Guest checkout requires a real
 * email-OTP round trip, too heavy to script N times; these are pre-verified
 * accounts instead so the concurrency test isn't measuring the mailer.
 *
 *   npx tsx scripts/qa-seed-flash-buyers.ts [count]
 *
 * Idempotent. Identifiable via the qatest_flash_ prefix; same cleanup query
 * as the other qatest_* fixtures.
 */
import argon2 from 'argon2';
import { prisma } from '../src/config/prisma';

const COUNT = Number(process.argv[2] ?? 50);
const PASSWORD = process.env.QA_FIXTURE_PASSWORD ?? 'QaTest123!';

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);
  for (let i = 1; i <= COUNT; i += 1) {
    const email = `qatest_flash_${String(i).padStart(3, '0')}@qatest.local`;
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: 'CUSTOMER', isActive: true, deletedAt: null, failedLoginAttempts: 0, lockedUntil: null, emailVerified: new Date() },
      create: { email, name: `QA Flash Buyer ${i}`, passwordHash, role: 'CUSTOMER', emailVerified: new Date() },
    });
  }
  console.log(`[qa-flash-buyers] ready: qatest_flash_001..${String(COUNT).padStart(3, '0')}@qatest.local / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
