import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { env } from '../../src/config/env';

const app = buildApp();

describe('GET /api/uploads/imagekit-auth', () => {
  it('401 anon / 403 customer', async () => {
    expect((await request(app).get('/api/uploads/imagekit-auth')).status).toBe(401);

    const { token } = await createCustomer();
    expect(
      (await request(app).get('/api/uploads/imagekit-auth').set(bearer(token))).status
    ).toBe(403);
  });

  it('an admin gets a token/expire/signature that verifies against IMAGEKIT_PRIVATE_KEY', async () => {
    const { token } = await createAdmin();
    const res = await request(app).get('/api/uploads/imagekit-auth').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: expect.any(String),
      expire: expect.any(Number),
      signature: expect.any(String),
    });

    // expire is a Unix-seconds timestamp comfortably in the future.
    expect(res.body.expire).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // signature is a real HMAC-SHA1 of token+expire under the private key —
    // recomputing it here is exactly what ImageKit's own servers do to
    // validate the upload request.
    const expected = createHmac('sha1', env.IMAGEKIT_PRIVATE_KEY)
      .update(res.body.token + res.body.expire)
      .digest('hex');
    expect(res.body.signature).toBe(expected);
  });

  it('two calls issue different tokens (never replayable)', async () => {
    const { token } = await createAdmin();
    const a = await request(app).get('/api/uploads/imagekit-auth').set(bearer(token));
    const b = await request(app).get('/api/uploads/imagekit-auth').set(bearer(token));
    expect(a.body.token).not.toBe(b.body.token);
  });
});
