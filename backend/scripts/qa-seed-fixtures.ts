/**
 * QA stress-test fixtures — accounts and coupons that TEST_PLAN.md's
 * scripted tests need but backend/prisma/seed.ts doesn't create (customer
 * accounts, admin-checkout account, secondary-role staff, coupons).
 *
 *   npx tsx scripts/qa-seed-fixtures.ts
 *
 * Idempotent (all upserts) — safe to re-run to reset passwords, coupon
 * usage caps, and redemption counts back to their starting state between
 * test runs without wiping orders/products. Everything it creates is
 * prefixed qatest_ / QATEST- so it's easy to find and delete afterward.
 */
import argon2 from 'argon2';
import { prisma } from '../src/config/prisma';

const PASSWORD = process.env.QA_FIXTURE_PASSWORD ?? 'QaTest123!';

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);

  // ---- Customer accounts (for IDOR / horizontal-escalation and cart tests) ----
  const customer1 = await prisma.user.upsert({
    where: { email: 'qatest_customer1@qatest.local' },
    update: { passwordHash, role: 'CUSTOMER', isActive: true, deletedAt: null, failedLoginAttempts: 0, lockedUntil: null, emailVerified: new Date() },
    create: { email: 'qatest_customer1@qatest.local', name: 'QA Test Customer 1', passwordHash, role: 'CUSTOMER', emailVerified: new Date() },
  });
  const customer2 = await prisma.user.upsert({
    where: { email: 'qatest_customer2@qatest.local' },
    update: { passwordHash, role: 'CUSTOMER', isActive: true, deletedAt: null, failedLoginAttempts: 0, lockedUntil: null, emailVerified: new Date() },
    create: { email: 'qatest_customer2@qatest.local', name: 'QA Test Customer 2', passwordHash, role: 'CUSTOMER', emailVerified: new Date() },
  });

  // Real (v4, Zod .uuid()-valid) ids — a fixed non-v4 placeholder here
  // previously broke any /api/addresses/:id call against these fixtures.
  for (const [user, label] of [[customer1, 'Customer 1'], [customer2, 'Customer 2']] as const) {
    const existing = await prisma.address.findFirst({ where: { userID: user.id }, select: { id: true } });
    if (!existing) {
      await prisma.address.create({
        data: {
          userID: user.id,
          fullName: `QA Test ${label}`,
          phone: user === customer1 ? '+96170000001' : '+96170000002',
          addressLine: '123 QA Test Street',
          city: 'Beirut',
          region: 'BEIRUT',
          isDefault: true,
        },
      });
    }
  }

  // ---- Admin-checkout account (Section 2.1) ----
  await prisma.user.upsert({
    where: { email: 'qatest_admin@qatest.local' },
    update: { passwordHash, role: 'ADMIN', isActive: true, deletedAt: null, failedLoginAttempts: 0, lockedUntil: null, emailVerified: new Date() },
    create: { email: 'qatest_admin@qatest.local', name: 'QA Test Admin', passwordHash, role: 'ADMIN', emailVerified: new Date() },
  });

  // ---- Secondary-role staff accounts (Section 2.5) — reuse the roles seed.ts creates ----
  const orderDesk = await prisma.role.findUnique({ where: { name: 'Order desk' }, select: { id: true } });
  const catalogEditor = await prisma.role.findUnique({ where: { name: 'Catalog editor' }, select: { id: true } });
  await prisma.user.upsert({
    where: { email: 'qatest_staff_orderdesk@qatest.local' },
    update: { passwordHash, role: 'STAFF', isActive: true, deletedAt: null, customRoleID: orderDesk?.id ?? null, emailVerified: new Date() },
    create: { email: 'qatest_staff_orderdesk@qatest.local', name: 'QA Test Order Desk', passwordHash, role: 'STAFF', customRoleID: orderDesk?.id ?? null, emailVerified: new Date() },
  });
  await prisma.user.upsert({
    where: { email: 'qatest_staff_catalog@qatest.local' },
    update: { passwordHash, role: 'STAFF', isActive: true, deletedAt: null, customRoleID: catalogEditor?.id ?? null, emailVerified: new Date() },
    create: { email: 'qatest_staff_catalog@qatest.local', name: 'QA Test Catalog Editor', passwordHash, role: 'STAFF', customRoleID: catalogEditor?.id ?? null, emailVerified: new Date() },
  });

  // ---- Coupons ----
  // Single-use, one global redemption — Section 1.4 race.
  await prisma.coupon.upsert({
    where: { code: 'QATEST-SINGLE' },
    update: { isActive: true, startsAt: null, endsAt: null, maxRedemptions: 1, maxPerCustomer: 1, timesRedeemed: 0 },
    create: { code: 'QATEST-SINGLE', type: 'PERCENT', value: 10, maxRedemptions: 1, maxPerCustomer: 1 },
  });
  // Capped at 50 uses, unlimited per customer — Section 1.4/1.8-style capped race.
  await prisma.coupon.upsert({
    where: { code: 'QATEST-CAP50' },
    update: { isActive: true, startsAt: null, endsAt: null, maxRedemptions: 50, maxPerCustomer: null, timesRedeemed: 0 },
    create: { code: 'QATEST-CAP50', type: 'PERCENT', value: 10, maxRedemptions: 50, maxPerCustomer: null },
  });
  // 100% off — Section 6.7 zero-value order.
  await prisma.coupon.upsert({
    where: { code: 'QATEST-FULLOFF' },
    update: { isActive: true, startsAt: null, endsAt: null, maxRedemptions: null, maxPerCustomer: null, timesRedeemed: 0 },
    create: { code: 'QATEST-FULLOFF', type: 'PERCENT', value: 100, maxRedemptions: null, maxPerCustomer: null },
  });
  // Open-ended by default — Section 6.6 flips endsAt/isActive mid-test, then
  // this script resets it back to open-ended on the next fixture reset.
  await prisma.coupon.upsert({
    where: { code: 'QATEST-EXPIRING' },
    update: { isActive: true, startsAt: null, endsAt: null, maxRedemptions: null, maxPerCustomer: null, timesRedeemed: 0 },
    create: { code: 'QATEST-EXPIRING', type: 'PERCENT', value: 15, maxRedemptions: null, maxPerCustomer: null },
  });

  // Clear out any leftover redemptions/carts from a previous QA pass so
  // coupon caps and cart-merge tests start from a known state without a
  // full DB truncate.
  await prisma.couponRedemption.deleteMany({
    where: { coupon: { code: { startsWith: 'QATEST-' } } },
  });
  await prisma.cartItem.deleteMany({ where: { cart: { userID: { in: [customer1.id, customer2.id] } } } });

  console.log('[qa-fixtures] ready:');
  console.log(`  qatest_customer1@qatest.local / qatest_customer2@qatest.local / qatest_admin@qatest.local`);
  console.log(`  qatest_staff_orderdesk@qatest.local / qatest_staff_catalog@qatest.local`);
  console.log(`  password (all): ${PASSWORD}`);
  console.log('  coupons: QATEST-SINGLE, QATEST-CAP50, QATEST-FULLOFF, QATEST-EXPIRING');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
