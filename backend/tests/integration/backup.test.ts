import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAdmin, createStaff, createCustomer, bearer, signAccessToken } from '../helpers/auth';
import { prisma } from '../../src/config/prisma';

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
import {
  runBackup,
  listBackups,
  restoreBackup,
  getDriveStatus,
  buildDriveAuthUrl,
  completeDriveConnection,
  disconnectDrive,
  updateBackupSettings,
  isBackupDueNow,
} from '../../src/modules/backup/backup.service';
import { signConnectState } from '../../src/modules/backup/drive-state';

const app = buildApp();

describe('backup endpoints — role gate', () => {
  it('POST /api/admin/backup: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).post('/api/admin/backup')).status).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).post('/api/admin/backup').set(bearer(customerToken))).status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).post('/api/admin/backup').set(bearer(staffToken))).status
    ).toBe(403);
  });

  it('GET /api/admin/backup: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).get('/api/admin/backup')).status).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).get('/api/admin/backup').set(bearer(customerToken))).status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).get('/api/admin/backup').set(bearer(staffToken))).status
    ).toBe(403);
  });

  it('POST /api/admin/backup/:id/restore: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).post('/api/admin/backup/f1/restore')).status).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).post('/api/admin/backup/f1/restore').set(bearer(customerToken))).status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).post('/api/admin/backup/f1/restore').set(bearer(staffToken))).status
    ).toBe(403);
  });

  it('GET /api/admin/backup/drive/status: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).get('/api/admin/backup/drive/status')).status).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).get('/api/admin/backup/drive/status').set(bearer(customerToken))).status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).get('/api/admin/backup/drive/status').set(bearer(staffToken))).status
    ).toBe(403);
  });

  it('GET /api/admin/backup/drive/connect: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).get('/api/admin/backup/drive/connect')).status).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).get('/api/admin/backup/drive/connect').set(bearer(customerToken))).status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).get('/api/admin/backup/drive/connect').set(bearer(staffToken))).status
    ).toBe(403);
  });

  it('POST /api/admin/backup/drive/disconnect: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).post('/api/admin/backup/drive/disconnect')).status).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).post('/api/admin/backup/drive/disconnect').set(bearer(customerToken))).status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).post('/api/admin/backup/drive/disconnect').set(bearer(staffToken))).status
    ).toBe(403);
  });

  it('GET /api/admin/backup/settings: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).get('/api/admin/backup/settings')).status).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).get('/api/admin/backup/settings').set(bearer(customerToken))).status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).get('/api/admin/backup/settings').set(bearer(staffToken))).status
    ).toBe(403);
  });

  it('PATCH /api/admin/backup/settings: 401 anon, 403 customer, 403 staff', async () => {
    expect(
      (await request(app).patch('/api/admin/backup/settings').send({ frequency: 'DAILY' })).status
    ).toBe(401);

    const { token: customerToken } = await createCustomer();
    expect(
      (await request(app).patch('/api/admin/backup/settings').set(bearer(customerToken)).send({ frequency: 'DAILY' }))
        .status
    ).toBe(403);

    const { token: staffToken } = await createStaff();
    expect(
      (await request(app).patch('/api/admin/backup/settings').set(bearer(staffToken)).send({ frequency: 'DAILY' }))
        .status
    ).toBe(403);
  });
});

describe('POST /api/admin/backup — admin', () => {
  beforeEach(() => {
    vi.mocked(runBackup).mockReset();
  });

  it('runs the backup and audit-logs the trigger with the actor', async () => {
    const { user, token } = await createAdmin();
    vi.mocked(runBackup).mockResolvedValue({
      ok: true,
      at: new Date().toISOString(),
      trigger: 'manual',
      file: { name: 'alistore-20260101-000000-aaaaaaaa.dump', bytes: 1234, driveId: 'drive-file-1' },
      pruned: [],
    });

    const res = await request(app).post('/api/admin/backup').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(runBackup).toHaveBeenCalledWith('manual');

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.run', actorID: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.entityID).toBe('drive-file-1');
  });

  it('audit-logs a failed trigger and surfaces the error', async () => {
    const { user, token } = await createAdmin();
    vi.mocked(runBackup).mockRejectedValue(new Error('Drive is not configured.'));

    const res = await request(app).post('/api/admin/backup').set(bearer(token));
    expect(res.status).toBe(500);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.run.failed', actorID: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});

describe('GET /api/admin/backup — admin', () => {
  it('lists backups from the service', async () => {
    const { token } = await createAdmin();
    vi.mocked(listBackups).mockResolvedValue([
      { id: 'f1', name: 'alistore-20260101-000000-aaaaaaaa.dump', bytes: 100, createdAt: '2026-01-01T00:00:00Z' },
    ]);

    const res = await request(app).get('/api/admin/backup').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.backups).toHaveLength(1);
    expect(res.body.retentionCount).toBe(7);
  });
});

describe('POST /api/admin/backup/:id/restore — admin', () => {
  beforeEach(() => {
    vi.mocked(restoreBackup).mockReset();
  });

  it('requires a fresh session (step-up) even for an ADMIN', async () => {
    const { user } = await createAdmin();
    // authTime far outside STEP_UP_FRESHNESS_MIN (10 min default) — a
    // session kept alive only by silent refresh, never a fresh login.
    const staleToken = signAccessToken(user.id, 'ADMIN', Math.floor(Date.now() / 1000) - 3600);

    const res = await request(app).post('/api/admin/backup/f1/restore').set(bearer(staleToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it('restores and audit-logs with the actor, given a fresh session', async () => {
    const { user, token } = await createAdmin();
    vi.mocked(restoreBackup).mockResolvedValue({ ok: true, restoredFrom: 'f1', relations: 42 });

    const res = await request(app).post('/api/admin/backup/f1/restore').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, relations: 42 });
    expect(restoreBackup).toHaveBeenCalledWith('f1');

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.restore', actorID: user.id, entityID: 'f1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('audit-logs a failed restore and surfaces the error', async () => {
    const { user, token } = await createAdmin();
    vi.mocked(restoreBackup).mockRejectedValue(new Error('Not a valid backup archive.'));

    const res = await request(app).post('/api/admin/backup/f1/restore').set(bearer(token));
    expect(res.status).toBe(500);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.restore.failed', actorID: user.id, entityID: 'f1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});

describe('GET /api/admin/backup/drive/status — admin', () => {
  it('returns the connection status from the service', async () => {
    const { token } = await createAdmin();
    vi.mocked(getDriveStatus).mockResolvedValue({
      configured: true,
      connectedEmail: 'owner@example.com',
      connectedAt: '2026-01-01T00:00:00Z',
    });

    const res = await request(app).get('/api/admin/backup/drive/status').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configured: true,
      connectedEmail: 'owner@example.com',
      connectedAt: '2026-01-01T00:00:00Z',
    });
  });
});

describe('GET /api/admin/backup/drive/connect — admin', () => {
  it('returns a consent URL built for the callback redirect_uri', async () => {
    const { token } = await createAdmin();
    vi.mocked(buildDriveAuthUrl).mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');

    const res = await request(app).get('/api/admin/backup/drive/connect').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    expect(buildDriveAuthUrl).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/backup/drive/callback'),
      expect.any(String)
    );
  });
});

describe('POST /api/admin/backup/drive/disconnect — admin', () => {
  it('disconnects and audit-logs with the actor', async () => {
    const { user, token } = await createAdmin();
    vi.mocked(disconnectDrive).mockResolvedValue(undefined);

    const res = await request(app).post('/api/admin/backup/drive/disconnect').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(disconnectDrive).toHaveBeenCalled();

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.drive.disconnect', actorID: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});

describe('GET /api/admin/backup/drive/callback — no auth (state-gated)', () => {
  beforeEach(() => {
    vi.mocked(completeDriveConnection).mockReset();
  });

  it('completes the connection for a valid, freshly-signed state and redirects with result=connected', async () => {
    const { user } = await createAdmin();
    const state = signConnectState(user.id);
    vi.mocked(completeDriveConnection).mockResolvedValue({ email: 'owner@example.com' });

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('result=connected');
    expect(completeDriveConnection).toHaveBeenCalledWith('auth-code', expect.stringContaining('/drive/callback'));

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.drive.connect', actorID: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects a forged/garbage state without ever calling the service', async () => {
    const res = await request(app)
      .get('/api/admin/backup/drive/callback')
      .query({ code: 'auth-code', state: 'not-a-real-token' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('result=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('redirects with result=error when Google itself reports an error (user declined consent)', async () => {
    const res = await request(app).get('/api/admin/backup/drive/callback').query({ error: 'access_denied' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('result=error');
    expect(completeDriveConnection).not.toHaveBeenCalled();
  });

  it('audit-logs a failed exchange and still redirects with result=error', async () => {
    const { user } = await createAdmin();
    const state = signConnectState(user.id);
    vi.mocked(completeDriveConnection).mockRejectedValue(new Error('Google Drive connect failed: invalid_grant'));

    const res = await request(app).get('/api/admin/backup/drive/callback').query({ code: 'auth-code', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('result=error');

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.drive.connect.failed', actorID: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});

describe('GET /api/admin/backup/settings — admin', () => {
  it('returns the schedule status from the service', async () => {
    const { token } = await createAdmin();
    vi.mocked(isBackupDueNow).mockResolvedValue({
      due: false,
      frequency: 'WEEKLY',
      lastBackupAt: '2026-01-01T00:00:00Z',
      nextDueAt: '2026-01-08T00:00:00Z',
    });

    const res = await request(app).get('/api/admin/backup/settings').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      due: false,
      frequency: 'WEEKLY',
      lastBackupAt: '2026-01-01T00:00:00Z',
      nextDueAt: '2026-01-08T00:00:00Z',
    });
  });
});

describe('PATCH /api/admin/backup/settings — admin', () => {
  beforeEach(() => {
    vi.mocked(updateBackupSettings).mockReset();
  });

  it('updates the frequency and audit-logs with the actor', async () => {
    const { user, token } = await createAdmin();
    vi.mocked(updateBackupSettings).mockResolvedValue({ frequency: 'DAILY' });

    const res = await request(app)
      .patch('/api/admin/backup/settings')
      .set(bearer(token))
      .send({ frequency: 'DAILY' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ frequency: 'DAILY' });
    expect(updateBackupSettings).toHaveBeenCalledWith('DAILY');

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Backup', action: 'backup.settings.update', actorID: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect((audit!.metadata as { frequency: string }).frequency).toBe('DAILY');
  });

  it('rejects an invalid frequency value (400, service never called)', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .patch('/api/admin/backup/settings')
      .set(bearer(token))
      .send({ frequency: 'HOURLY' });
    expect(res.status).toBe(400);
    expect(updateBackupSettings).not.toHaveBeenCalled();
  });

  it('rejects a missing frequency field (400)', async () => {
    const { token } = await createAdmin();
    const res = await request(app).patch('/api/admin/backup/settings').set(bearer(token)).send({});
    expect(res.status).toBe(400);
    expect(updateBackupSettings).not.toHaveBeenCalled();
  });
});
