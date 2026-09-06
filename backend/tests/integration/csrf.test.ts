import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';

// CSRF is off by default under test; this suite opts it on.
const app = buildApp({ csrf: true });

function csrfFrom(setCookie: string[] | string | undefined): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = arr.find((c) => c.startsWith('csrfToken='));
  if (!line) throw new Error('no csrfToken cookie set');
  return decodeURIComponent(line.split(';')[0].split('=')[1]);
}

describe('CSRF (double-submit cookie)', () => {
  it('sets a csrfToken cookie on the /api/csrf primer and echoes it in the body', async () => {
    const res = await request(app).get('/api/csrf');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const cookie = csrfFrom(res.headers['set-cookie']);
    expect(cookie.length).toBeGreaterThanOrEqual(32);
    expect(res.body.csrfToken).toBe(cookie); // body value == cookie value
    // not httpOnly (the SPA must read it), SameSite=Strict
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('csrfToken='))!;
    expect(raw.toLowerCase()).not.toContain('httponly');
    expect(raw.toLowerCase()).toContain('samesite=strict');
  });

  it('blocks a state-changing request with no CSRF header (403)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'x@test.dev', password: 'whatever' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/csrf/i);
  });

  it('blocks a request whose header does not match the cookie (403)', async () => {
    const primer = await request(app).get('/api/csrf');
    const cookie = (primer.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('csrfToken=')
    )!;
    const res = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookie.split(';')[0])
      .set('X-CSRF-Token', 'not-the-right-value')
      .send({ identifier: 'x@test.dev', password: 'whatever' });
    expect(res.status).toBe(403);
  });

  it('allows a request whose header matches the cookie (reaches the handler)', async () => {
    const primer = await request(app).get('/api/csrf');
    const setCookie = primer.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('csrfToken='))!.split(';')[0];
    const token = csrfFrom(setCookie);

    const res = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', token)
      .send({ identifier: 'x@test.dev', password: 'whatever' });

    // CSRF passed -> the login handler ran and rejected the bad credentials.
    expect(res.status).toBe(401);
  });

  it('exempts POST /api/auth/refresh (bootstrap runs before any cookie primer)', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    // no CSRF header, yet not a 403 - it fails on the missing refresh token instead
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(401);
  });
});
