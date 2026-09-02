import { z } from 'zod';

// Loads backend/.env into process.env — every entry point (tsx dev/watch,
// the built dist/server.js, vitest, prisma's seed script) ends up importing
// this module before touching process.env, so wiring it here covers all of
// them at once instead of threading --env-file through each npm script.
// Node's native loader (stable since ~20.12) needs no new dependency; it's
// wrapped in try/catch since CI environments that inject real env vars
// directly won't have a .env file on disk, and that's fine.
try {
  process.loadEnvFile();
} catch {
  // no .env file present — assume the environment already has these vars
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
