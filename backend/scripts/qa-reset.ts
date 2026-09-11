/**
 * Full QA reset — wipes every row in the local dev database (via the same
 * TRUNCATE ... CASCADE the integration test suite uses between tests, see
 * tests/helpers/db.ts), then repopulates it: the catalog/admin/staff seed
 * (prisma/seed.ts) followed by QA-specific accounts and coupons
 * (scripts/qa-seed-fixtures.ts).
 *
 * Use this before Sections 1, 4, 5, 9 of TEST_PLAN.md and whenever a
 * destructive test (delete, bulk op) needs to run again from a known state.
 * Snapshot first with scripts/qa-snapshot.sh if you need a pre/post diff of
 * one specific test rather than a full reset.
 *
 *   npx tsx scripts/qa-reset.ts
 *
 * Refuses to run unless DATABASE_URL points at localhost, as a guard against
 * ever pointing this at a non-local database.
 */
import { execFileSync } from 'node:child_process';
import { prisma } from '../src/config/prisma';
import { resetDb } from '../tests/helpers/db';

function requireLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(
      `DATABASE_URL does not look like a local database (${url || '<unset>'}). Refusing to run a destructive reset.`
    );
  }
}

async function main() {
  requireLocalDatabase();

  console.log('[qa-reset] truncating all tables…');
  await resetDb();

  console.log('[qa-reset] running catalog/admin seed (npm run seed)…');
  execFileSync('npm', ['run', 'seed'], { stdio: 'inherit', shell: true });

  console.log('[qa-reset] running QA fixtures (accounts + coupons)…');
  execFileSync('npx', ['tsx', 'scripts/qa-seed-fixtures.ts'], { stdio: 'inherit', shell: true });

  console.log('[qa-reset] done — database is back to a known baseline.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
