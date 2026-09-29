import { afterAll, afterEach, beforeEach } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { resetDb } from './db';

const originalFetch = globalThis.fetch;

// Each test starts from an empty database.
beforeEach(async () => {
  // Keep the real CAPTCHA verifier and OTP service, but replace their external
  // HTTP boundary. Valid test tokens succeed; invalid ones still fail closed.
  // A live siteverify timeout used to turn unrelated pricing tests into 400s.
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://api.hcaptcha.com/siteverify') {
      const body = new URLSearchParams(String(init?.body ?? ''));
      return Response.json({
        success: body.get('response') === '10000000-aaaa-bbbb-cccc-000000000001'
          && body.get('secret') === '0x0000000000000000000000000000000000000000',
      });
    }
    return originalFetch(input, init);
  };
  await resetDb();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(async () => {
  await prisma.$disconnect();
});
