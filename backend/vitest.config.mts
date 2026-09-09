import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://alistore:alistore@localhost:5432/alistore_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    // Integration tests share one Postgres database and reset it between
    // tests — they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 30_000,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL_DAYS: '30',
      CORS_ORIGIN: 'http://localhost:3000',
      IMAGEKIT_PRIVATE_KEY: 'test-imagekit-private-key-0123456789',
      // Force the mailer into its "not configured" no-op path so the suite
      // NEVER opens a real SMTP socket. Blank here wins over any SMTP_* in a
      // local .env (dotenv doesn't override). Tests that assert an email was
      // sent do it by `vi.mock`-ing the specific mailer function, which works
      // regardless of this. Without it, a flaky/slow network makes real
      // sendMail() calls hang for minutes and stall the whole (serial) suite.
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      // Set so the owner-notification path in order-cancellation.test.ts /
      // the checkout notification tests actually fires its mailer mock.
      OWNER_NOTIFICATION_EMAIL: 'owner@test.dev',
    },
  },
});
