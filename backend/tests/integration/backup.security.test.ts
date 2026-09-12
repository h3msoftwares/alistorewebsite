import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../../src/app';
import { env } from '../../src/config/env';
import { createAdmin, bearer } from '../helpers/auth';
import { signConnectState } from '../../src/modules/backup/drive-state';

// Mirrors tests/integration/admin-auth.security.test.ts's JWT-hardening
// suite, applied to the backup module's own signed token (drive-state.ts's
// "state" used by the Drive OAuth callback) and its other attacker-facing
// surfaces (the one unauthenticated route, rate limits, and the
// client-supplied restore target).

vi.mock('../../src/modules/backup/backup.service', () => ({
  runBackup: vi.fn(),
  listBackups: vi.fn(),
  restoreBackup: vi.fn(),
  getDriveStatus: vi.fn(),
  buildDriveAuthUrl: vi.fn(),
  completeDriveConnection: vi.fn(),
  disconnectDrive: vi.fn(),
  getBackupSettings: vi.fn(),
  updateBackupSettings: vi.fn(),
  isBackupDueNow: vi.fn(),
}));
import { completeDriveConnection } from '../../src/modules/backup/backup.service';

const app = buildApp();

describe('backup — Drive callback state-token hardening (forgery attacks)', () => {
  beforeEach(() => {
    vi.mocked(completeDriveConnection).mockReset();
  });

  it('accepts a legitimately-signed state (baseline)', async () => {
    const { user } = await createAdmin();
    vi.mocked(completeDriveConnection).mockResolvedValue({ email: 'owner@example.com' });
    const state = signConnectState(user.id);

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('drive=connected');
  });

  it('rejects an unsigned "alg:none" state', async () => {
    const { user } = await createAdmin();
    const forged = jwt.sign({ sub: user.id, purpose: 'backup-drive-connect' }, '', { algorithm: 'none' });

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state: forged });
    expect(res.headers.location).toContain('drive=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('rejects a state signed with a different secret', async () => {
    const { user } = await createAdmin();
    const forged = jwt.sign({ sub: user.id, purpose: 'backup-drive-connect' }, randomBytes(32).toString('hex'), {
      algorithm: 'HS256',
      expiresIn: '10m',
    });

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state: forged });
    expect(res.headers.location).toContain('drive=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('rejects an algorithm-substituted state (HS512 with the real secret)', async () => {
    // The exact gap fixed in drive-state.ts: without a pinned `algorithms`
    // list, jsonwebtoken accepts any HS* the token header asks for.
    const { user } = await createAdmin();
    const forged = jwt.sign({ sub: user.id, purpose: 'backup-drive-connect' }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS512',
      expiresIn: '10m',
    });

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state: forged });
    expect(res.headers.location).toContain('drive=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('rejects a state whose payload was edited after signing (actor-id substitution)', async () => {
    const { user: real } = await createAdmin();
    const state = signConnectState(real.id);
    const [h, p, s] = state.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    claims.sub = 'some-other-admin-id';
    const forged = `${h}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${s}`;

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state: forged });
    expect(res.headers.location).toContain('drive=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('rejects an expired state', async () => {
    const { user } = await createAdmin();
    const expired = jwt.sign({ sub: user.id, purpose: 'backup-drive-connect' }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: -10,
    });

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state: expired });
    expect(res.headers.location).toContain('drive=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('rejects a real, validly-signed token minted for a different purpose (a customer JWT reused as state)', async () => {
    const { token: customerAccessToken } = await createAdmin(); // valid HS256/env secret, but no `purpose` claim
    const res = await request(app)
      .get('/api/admin/backup/drive/callback')
      .query({ code: 'auth-code', state: customerAccessToken });
    expect(res.headers.location).toContain('drive=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('rejects a missing code or state without ever calling the service', async () => {
    const r1 = await request(app).get('/api/admin/backup/drive/callback').query({ state: 'whatever' });
    const r2 = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code' });
    expect(r1.headers.location).toContain('drive=error');
    expect(r2.headers.location).toContain('drive=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('never requires a bearer token — the state is the only gate', async () => {
    const { user } = await createAdmin();
    vi.mocked(completeDriveConnection).mockResolvedValue({ email: 'owner@example.com' });
    const state = signConnectState(user.id);

    // No Authorization header at all.
    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('drive=connected');
  });
});

describe('backup — rate limit cannot be spoofed away', () => {
  it('rotating X-Forwarded-For does not bypass POST /api/admin/backup/:id/restore (3/15min)', async () => {
    const { token } = await createAdmin();
    const throttled = buildApp({ backupRunRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await request(throttled)
        .post('/api/admin/backup/f1/restore')
        .set(bearer(token))
        .set('X-Forwarded-For', `10.20.30.${i}`);
      statuses.push(r.status);
    }
    // First 3 pass the limiter (they still fail downstream — restoreBackup
    // is mocked to undefined here — but that's a 500, not a 429); the 4th
    // must be rate-limited regardless of the spoofed header.
    expect(statuses[3]).toBe(429);
  });

  it('rotating X-Forwarded-For does not bypass POST /api/admin/backup (5/15min)', async () => {
    const { token } = await createAdmin();
    const throttled = buildApp({ backupRunRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(throttled)
        .post('/api/admin/backup')
        .set(bearer(token))
        .set('X-Forwarded-For', `10.20.30.${i}`);
      statuses.push(r.status);
    }
    expect(statuses[5]).toBe(429);
  });

  it('rotating X-Forwarded-For does not bypass the Drive callback limiter (20/15min)', async () => {
    const throttled = buildApp({ backupRunRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const r = await request(throttled)
        .get('/api/admin/backup/drive/callback')
        .set('X-Forwarded-For', `10.20.30.${i}`)
        .query({ code: 'x', state: 'not-a-real-token' });
      statuses.push(r.status);
    }
    expect(statuses[20]).toBe(429);
  });
});
