/**
 * Creates (or resets) a CUSTOMER account for manual testing of the storefront
 * login / account flows.
 *
 *   npx tsx scripts/create-test-user.ts
 *
 * Idempotent: re-running resets the password and clears any lockout.
 * Override via env: TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_USER_NAME.
 */
import argon2 from 'argon2';
import { prisma } from '../src/config/prisma';

const email = process.env.TEST_USER_EMAIL ?? 'hussein.kteish2001@gmail.com';
const password = process.env.TEST_USER_PASSWORD ?? 'ChangeMe123!';
const name = process.env.TEST_USER_NAME ?? 'Hussein Kteish';

async function main() {
  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'CUSTOMER',
      isActive: true,
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: { email, name, passwordHash, role: 'CUSTOMER' },
  });

  console.log(`✓ CUSTOMER ready: ${user.email}  (id ${user.id})`);
  console.log(`  password: ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
