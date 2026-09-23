import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser, bearer } from '../helpers/auth';

const app = buildApp();

const OLD = 'OldPassw0rd!';
const NEW = 'BrandNewP4ss!';

async function makeUser() {
  return createUser({ role: 'CUSTOMER', password: OLD, emailVerified: true });
}

describe('POST /api/auth/change-password', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong current password with 400 and does not change anything', async () => {
    const { user, token } = await makeUser();
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: 'not-it', newPassword: NEW });

    expect(res.status).toBe(400);
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    expect(after).toBe(before);
  });

  it('rejects a new password equal to the current one (400)', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: OLD, newPassword: OLD });
    expect(res.status).toBe(400);
  });

  it('rejects a too-short new password (400)', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: OLD, newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('changes the password, revokes other sessions, keeps the caller signed in', async () => {
    const { user } = await makeUser();

    // a real login so there's a refresh token / session to revoke
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.email, password: OLD });
    expect(login.status).toBe(200);
    const oldRefreshCookie = login.headers['set-cookie'];
    const accessToken = login.body.accessToken as string;

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(accessToken))
      .send({ currentPassword: OLD, newPassword: NEW });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.headers['set-cookie']).toBeDefined(); // fresh refresh cookie for this browser

    // every pre-existing refresh token is revoked
    const live = await prisma.refreshToken.count({ where: { userID: user.id, revokedAt: null } });
    expect(live).toBe(1); // only the freshly-issued one

    // the old refresh cookie no longer works
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', oldRefreshCookie);
    expect(reuse.status).toBe(401);

    // new password logs in, old one does not
    expect(
      (await request(app).post('/api/auth/login').send({ identifier: user.email, password: NEW })).status
    ).toBe(200);
    expect(
      (await request(app).post('/api/auth/login').send({ identifier: user.email, password: OLD })).status
    ).toBe(401);
  });

  it('records an AuditLog row on success — who and when, never the password', async () => {
    const { user, token } = await makeUser();

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'User', entityID: user.id, action: 'password_change' },
    });
    expect(log.actorID).toBe(user.id);
    expect(JSON.stringify(log.metadata)).not.toContain(NEW);
    expect(JSON.stringify(log.metadata)).not.toContain(OLD);
  });

  it('records an AuditLog row on a failed attempt (wrong current password), without the password', async () => {
    const { user, token } = await makeUser();

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: 'not-it', newPassword: NEW });
    expect(res.status).toBe(400);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'User', entityID: user.id, action: 'password_change.failed' },
    });
    expect(log.actorID).toBe(user.id);
    expect(JSON.stringify(log.metadata)).not.toContain(NEW);
    expect(JSON.stringify(log.metadata)).not.toContain('not-it');
  });
});
