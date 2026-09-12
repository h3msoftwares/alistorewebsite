import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../src/modules/backup/pg-dump', () => ({ runPgDump: vi.fn() }));
vi.mock('../../src/modules/backup/pg-restore', () => ({ restoreFromFile: vi.fn() }));
vi.mock('../../src/modules/backup/drive.client', () => ({
  isConfigured: vi.fn(),
  uploadFile: vi.fn(),
  listBackups: vi.fn(),
  deleteFile: vi.fn(),
  downloadFile: vi.fn(),
  // Re-exported as-is by backup.service.ts (getDriveStatus etc.) — not
  // exercised by these tests, but must exist for the module to load.
  getConnectionStatus: vi.fn(),
  buildAuthUrl: vi.fn(),
  completeConnection: vi.fn(),
  disconnect: vi.fn(),
}));

import { runPgDump } from '../../src/modules/backup/pg-dump';
import { restoreFromFile } from '../../src/modules/backup/pg-restore';
import * as drive from '../../src/modules/backup/drive.client';
import { prisma } from '../../src/config/prisma';
import {
  runBackup,
  listBackups,
  restoreBackup,
  getBackupSettings,
  updateBackupSettings,
  isBackupDueNow,
} from '../../src/modules/backup/backup.service';

function makeTempFile(content = 'fake dump bytes'): string {
  const p = path.join(os.tmpdir(), `backup-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}.dump`);
  fs.writeFileSync(p, content);
  return p;
}

function driveFile(name: string, createdTime: string, id = name) {
  return { id, name, size: 100, createdTime };
}

describe('runBackup', () => {
  beforeEach(() => {
    vi.mocked(drive.isConfigured).mockReset();
    vi.mocked(drive.uploadFile).mockReset();
    vi.mocked(drive.listBackups).mockReset();
    vi.mocked(drive.deleteFile).mockReset();
    vi.mocked(runPgDump).mockReset();
  });

  it('throws before ever running pg_dump when Drive is not configured', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(false);
    await expect(runBackup('manual')).rejects.toThrow(/not configured/i);
    expect(runPgDump).not.toHaveBeenCalled();
  });

  it('uploads the dump, prunes beyond retention, and always deletes the local temp file', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    const tmp = makeTempFile();
    vi.mocked(runPgDump).mockResolvedValue({ path: tmp, name: 'alistore-20260101-000000-aaaaaaaa.dump', bytes: 16 });
    vi.mocked(drive.uploadFile).mockResolvedValue({
      id: 'new-file',
      name: 'alistore-20260101-000000-aaaaaaaa.dump',
      size: 16,
      createdTime: '2026-01-01T00:00:00Z',
    });
    // Retention default in test env is 7 (env.ts default) — 9 files
    // (including the just-uploaded one) means the 2 oldest get pruned.
    vi.mocked(drive.listBackups).mockResolvedValue([
      driveFile('alistore-20260101-000000-aaaaaaaa.dump', '2026-01-01T00:00:00Z', 'new-file'),
      driveFile('alistore-20251231-000000-bbbbbbbb.dump', '2025-12-31T00:00:00Z', 'f2'),
      driveFile('alistore-20251230-000000-cccccccc.dump', '2025-12-30T00:00:00Z', 'f3'),
      driveFile('alistore-20251229-000000-dddddddd.dump', '2025-12-29T00:00:00Z', 'f4'),
      driveFile('alistore-20251228-000000-eeeeeeee.dump', '2025-12-28T00:00:00Z', 'f5'),
      driveFile('alistore-20251227-000000-ffffffff.dump', '2025-12-27T00:00:00Z', 'f6'),
      driveFile('alistore-20251226-000000-11111111.dump', '2025-12-26T00:00:00Z', 'f7'),
      driveFile('alistore-20251225-000000-22222222.dump', '2025-12-25T00:00:00Z', 'oldest-2'),
      driveFile('alistore-20251224-000000-33333333.dump', '2025-12-24T00:00:00Z', 'oldest-1'),
    ]);
    vi.mocked(drive.deleteFile).mockResolvedValue(undefined);

    const result = await runBackup('manual');

    expect(result.ok).toBe(true);
    expect(result.file).toEqual({ name: 'alistore-20260101-000000-aaaaaaaa.dump', bytes: 16, driveId: 'new-file' });
    expect(drive.deleteFile).toHaveBeenCalledWith('oldest-1');
    expect(drive.deleteFile).toHaveBeenCalledWith('oldest-2');
    expect(drive.deleteFile).toHaveBeenCalledTimes(2);
    expect(result.pruned?.sort()).toEqual(
      ['alistore-20251224-000000-33333333.dump', 'alistore-20251225-000000-22222222.dump'].sort()
    );
    // The local dump is gone once the run completes.
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it('still deletes the local temp file when the upload fails', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    const tmp = makeTempFile();
    vi.mocked(runPgDump).mockResolvedValue({ path: tmp, name: 'alistore-20260101-000000-aaaaaaaa.dump', bytes: 16 });
    vi.mocked(drive.uploadFile).mockRejectedValue(new Error('network blip'));

    await expect(runBackup('manual')).rejects.toThrow('network blip');
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it('propagates a pg_dump failure without calling Drive at all', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    vi.mocked(runPgDump).mockRejectedValue(new Error('pg_dump exited 1'));

    await expect(runBackup('manual')).rejects.toThrow('pg_dump exited 1');
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });
});

describe('listBackups (service)', () => {
  beforeEach(() => {
    vi.mocked(drive.isConfigured).mockReset();
    vi.mocked(drive.listBackups).mockReset();
  });

  it('throws when Drive is not configured', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(false);
    await expect(listBackups()).rejects.toThrow(/not configured/i);
  });

  it('maps drive.client fields (size/createdTime) to the API shape (bytes/createdAt)', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    vi.mocked(drive.listBackups).mockResolvedValue([driveFile('a.dump', '2026-01-01T00:00:00Z', 'id-1')]);
    const result = await listBackups();
    expect(result).toEqual([{ id: 'id-1', name: 'a.dump', bytes: 100, createdAt: '2026-01-01T00:00:00Z' }]);
  });
});

describe('restoreBackup', () => {
  beforeEach(() => {
    vi.mocked(drive.isConfigured).mockReset();
    vi.mocked(drive.listBackups).mockReset();
    vi.mocked(drive.downloadFile).mockReset();
    vi.mocked(restoreFromFile).mockReset();
  });

  it('throws when Drive is not configured, before listing or downloading anything', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(false);
    await expect(restoreBackup('f1')).rejects.toThrow(/not configured/i);
    expect(drive.listBackups).not.toHaveBeenCalled();
    expect(drive.downloadFile).not.toHaveBeenCalled();
  });

  it('rejects an id that is not one of the currently listed backups, without downloading or restoring anything', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    vi.mocked(drive.listBackups).mockResolvedValue([driveFile('a.dump', '2026-01-01T00:00:00Z', 'real-id')]);

    await expect(restoreBackup('attacker-supplied-id')).rejects.toThrow(/not found/i);
    expect(drive.downloadFile).not.toHaveBeenCalled();
    expect(restoreFromFile).not.toHaveBeenCalled();
  });

  it('downloads, restores, and cleans up the temp file on success', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    vi.mocked(drive.listBackups).mockResolvedValue([driveFile('a.dump', '2026-01-01T00:00:00Z', 'real-id')]);
    vi.mocked(drive.downloadFile).mockResolvedValue(Buffer.from('fake dump bytes'));
    vi.mocked(restoreFromFile).mockReturnValue({ ok: true, relations: 12 });

    const result = await restoreBackup('real-id');
    expect(result).toEqual({ ok: true, restoredFrom: 'real-id', relations: 12 });

    // The temp path passed to restoreFromFile no longer exists afterward.
    const usedPath = vi.mocked(restoreFromFile).mock.calls[0][0];
    expect(fs.existsSync(usedPath)).toBe(false);
  });

  it('throws with the underlying error and still cleans up when the restore itself fails', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    vi.mocked(drive.listBackups).mockResolvedValue([driveFile('a.dump', '2026-01-01T00:00:00Z', 'real-id')]);
    vi.mocked(drive.downloadFile).mockResolvedValue(Buffer.from('fake dump bytes'));
    vi.mocked(restoreFromFile).mockReturnValue({ ok: false, error: 'not a valid archive' });

    await expect(restoreBackup('real-id')).rejects.toThrow('not a valid archive');
    const usedPath = vi.mocked(restoreFromFile).mock.calls[0][0];
    expect(fs.existsSync(usedPath)).toBe(false);
  });
});

describe('getBackupSettings / updateBackupSettings', () => {
  it('defaults to WEEKLY when no row exists yet', async () => {
    expect(await getBackupSettings()).toEqual({ frequency: 'WEEKLY' });
  });

  it('persists an updated frequency and reflects it on the next read', async () => {
    const updated = await updateBackupSettings('DAILY');
    expect(updated).toEqual({ frequency: 'DAILY' });
    expect(await getBackupSettings()).toEqual({ frequency: 'DAILY' });

    const row = await prisma.backupSettings.findUnique({ where: { id: 1 } });
    expect(row?.frequency).toBe('DAILY');
  });

  it('updating twice overwrites rather than erroring on the existing row', async () => {
    await updateBackupSettings('DAILY');
    await updateBackupSettings('MONTHLY');
    expect(await getBackupSettings()).toEqual({ frequency: 'MONTHLY' });
  });
});

describe('isBackupDueNow', () => {
  beforeEach(() => {
    vi.mocked(drive.isConfigured).mockReset();
    vi.mocked(drive.listBackups).mockReset();
  });

  it('reports due when Drive is not configured, without listing anything', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(false);
    const result = await isBackupDueNow();
    expect(result).toEqual({ due: true, frequency: 'WEEKLY', lastBackupAt: null, nextDueAt: null });
    expect(drive.listBackups).not.toHaveBeenCalled();
  });

  it('is due with no backups yet, even though Drive is configured', async () => {
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    vi.mocked(drive.listBackups).mockResolvedValue([]);
    const result = await isBackupDueNow();
    expect(result.due).toBe(true);
    expect(result.lastBackupAt).toBeNull();
  });

  it('uses the configured frequency and the newest backup to decide, and computes nextDueAt', async () => {
    await updateBackupSettings('DAILY');
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    // Two backups — the function must pick the NEWEST, not just the first.
    vi.mocked(drive.listBackups).mockResolvedValue([
      driveFile('old.dump', '2020-01-01T00:00:00Z', 'old'),
      driveFile('new.dump', new Date().toISOString(), 'new'),
    ]);

    const result = await isBackupDueNow();
    expect(result.frequency).toBe('DAILY');
    expect(result.due).toBe(false); // the newest backup was just "created" — not a day old yet
    expect(result.lastBackupAt).not.toBeNull();
    expect(result.nextDueAt).not.toBeNull();
  });

  it('is due once the newest backup is older than the configured interval', async () => {
    await updateBackupSettings('DAILY');
    vi.mocked(drive.isConfigured).mockResolvedValue(true);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(drive.listBackups).mockResolvedValue([driveFile('old.dump', twoDaysAgo, 'old')]);

    expect((await isBackupDueNow()).due).toBe(true);
  });
});
