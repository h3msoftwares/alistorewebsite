import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

// Load backend/.env the same way seed.ts / src/config/env.ts do, so
// SEED_ADMIN_PASSWORD and DATABASE_URL resolve whether this runs locally via
// `npm run seed:empty` or with env vars injected in CI. Node's native loader.
try {
  process.loadEnvFile();
} catch {
  // no .env on disk — assume the environment already provides these vars
}

const prisma = new PrismaClient();

/** Same guard as seed.ts — the plaintext admin password comes from the
 *  environment, is Argon2-hashed here, and is never written to the DB or
 *  committed. See backend/.env.example. */
function requireSeedAdminPassword(): string {
  const pw = process.env.SEED_ADMIN_PASSWORD;
  if (!pw || pw.length < 8) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to at least 8 characters before seeding. ' +
        'Add it to backend/.env (see backend/.env.example).'
    );
  }
  return pw;
}

/**
 * Empty seed — the bare minimum for the API to boot with nothing to browse:
 *   - the admin account (email admin@alistore.com, password from the env)
 *   - the SiteSetting singleton (id 1) with its shipped defaults, because the
 *     storefront chrome and checkout read that row on every request
 *
 * No collections, categories, products, or orders. Use it for a clean slate
 * to build the catalogue by hand from the admin UI, or as a fast baseline for
 * tests. Idempotent — safe to re-run.
 */
async function main() {
  console.log('[seed:empty] starting…');

  const adminPasswordHash = await argon2.hash(requireSeedAdminPassword());
  await prisma.user.upsert({
    where: { email: 'admin@alistore.com' },
    update: { emailVerified: new Date() },
    create: {
      email: 'admin@alistore.com',
      name: "Ali's Store Admin",
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
    },
  });

  await prisma.siteSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  console.log('[seed:empty] done — admin account + settings singleton only.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
