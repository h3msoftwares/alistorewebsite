import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://alistore:alistore@localhost:5432/alistore_test?schema=public';

/** Runs once before the whole test run: make sure the dedicated test
 *  database exists and its schema is at the latest migration. Idempotent. */
export default async function globalSetup() {
  await ensureDatabaseExists();

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

async function ensureDatabaseExists() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '').split('?')[0];
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (e) {
    // 42P04 = database already exists — anything else is a real problem.
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('already exists')) throw e;
  } finally {
    await admin.$disconnect();
  }
}
