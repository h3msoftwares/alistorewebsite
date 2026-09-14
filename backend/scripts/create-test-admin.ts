// One-off dev utility: create or reset a local ADMIN account for manual
// testing (e.g. the admin-panel "Outgoing mail account" / account
// email-change flows), without touching the seeded admin@alistore.com.
// Credentials are never hardcoded here — same reasoning as
// SEED_ADMIN_PASSWORD not being a literal in prisma/seed.ts.
//
// Usage: TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npx tsx scripts/create-test-admin.ts
import argon2 from 'argon2';
import { prisma } from '../src/config/prisma';

async function main() {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.error(
      'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD (>= 8 chars) in the environment before running this script.'
    );
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Test Admin', role: 'ADMIN', passwordHash, emailVerified: new Date() },
    update: {
      passwordHash,
      role: 'ADMIN',
      emailVerified: new Date(),
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  console.log('Created/updated test admin:', user.id, email);
}
main().finally(() => prisma.$disconnect());
