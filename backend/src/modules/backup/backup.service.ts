// The one place a backup actually happens — same code path for a scheduled
// GitHub Actions run (scripts/run-backup.ts) and a manual "Back up now"
// (POST /api/admin/backup), per the reuse requirement.
//
// Order of operations:
//   1. pg_dump to a local temp file. If this fails, the run fails and
//      nothing else is attempted — never upload a partial/missing dump.
//   2. Upload the dump to the configured Drive folder.
//   3. Prune Drive to the newest BACKUP_RETENTION_COUNT (only after a
//      successful upload — a failed upload must never cost an existing
//      backup).
//   4. Always delete the local temp file, success or failure.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { runPgDump } from './pg-dump';
import { restoreFromFile } from './pg-restore';
import * as drive from './drive.client';
import { selectForDeletion } from './retention';

export interface BackupResult {
  ok: boolean;
  at: string;
  trigger: 'manual' | 'schedule';
  file?: { name: string; bytes: number; driveId: string };
  pruned?: string[];
  error?: string;
}

export async function runBackup(trigger: 'manual' | 'schedule'): Promise<BackupResult> {
  const at = new Date().toISOString();

  if (!(await drive.isConfigured())) {
    throw new AppError('INTERNAL', 'Google Drive backups are not configured.');
  }

  const dump = await runPgDump();
  try {
    const bytes = fs.readFileSync(dump.path);
    const uploaded = await drive.uploadFile(bytes, dump.name);

    const all = await drive.listBackups();
    const doomed = selectForDeletion(all, env.BACKUP_RETENTION_COUNT);
    const pruned: string[] = [];
    for (const f of doomed) {
      await drive.deleteFile(f.id);
      pruned.push(f.name);
    }

    return {
      ok: true,
      at,
      trigger,
      file: { name: uploaded.name, bytes: dump.bytes, driveId: uploaded.id },
      pruned,
    };
  } finally {
    fs.rmSync(dump.path, { force: true });
  }
}

export interface BackupListItem {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
}

export async function listBackups(): Promise<BackupListItem[]> {
  if (!(await drive.isConfigured())) {
    throw new AppError('INTERNAL', 'Google Drive backups are not configured.');
  }
  const files = await drive.listBackups();
  return files.map((f) => ({ id: f.id, name: f.name, bytes: f.size, createdAt: f.createdTime }));
}

// ---- Google Drive connection (connect/disconnect from the admin panel) ----

export const getDriveStatus = drive.getConnectionStatus;
export const buildDriveAuthUrl = drive.buildAuthUrl;
export const completeDriveConnection = drive.completeConnection;
export const disconnectDrive = drive.disconnect;

export interface RestoreResult {
  ok: boolean;
  restoredFrom: string;
  relations?: number;
  error?: string;
}

/** Downloads one Drive backup and pg_restores it over DATABASE_URL.
 *  DESTRUCTIVE. Callers gate this behind step-up re-auth, a rate limit and
 *  an audit log (see backup.controller.ts) — this function itself just does
 *  the download + validate + restore, same as `runBackup` is just the
 *  dump + upload.
 *
 * `id` must be one of THIS tool's own listed backups — checked against
 * listBackups() (folder + naming pattern, see retention.ts's DUMP_NAME_RE)
 * before anything is downloaded. `drive.file` scope already limits what the
 * access token could reach to begin with, but the frontend only ever offers
 * ids it just listed, so any other id reaching here is either a stale/
 * mistaken reference or a request that didn't go through the normal listing
 * — reject it rather than trust a client-supplied id at face value for a
 * destructive operation. */
export async function restoreBackup(id: string): Promise<RestoreResult> {
  if (!(await drive.isConfigured())) {
    throw new AppError('INTERNAL', 'Google Drive backups are not configured.');
  }

  const backups = await listBackups();
  if (!backups.some((b) => b.id === id)) {
    throw new AppError('NOT_FOUND', 'That backup was not found in the connected Drive account.');
  }

  const bytes = await drive.downloadFile(id);
  const tmpPath = path.join(os.tmpdir(), `alistore-restore-${randomUUID()}.dump`);
  fs.writeFileSync(tmpPath, bytes);
  try {
    const result = restoreFromFile(tmpPath);
    if (!result.ok) {
      throw new AppError('INTERNAL', result.error ?? 'Restore failed.');
    }
    return { ok: true, restoredFrom: id, relations: result.relations };
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}
