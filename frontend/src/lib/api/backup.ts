import { api } from './client';

// ADMIN-only (not STAFF+ADMIN like the rest of /api/admin) — see
// backend/src/modules/backup/backup.routes.ts.

export interface BackupItem {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
}

/** A dump + Drive upload can run well past Netlify's 26s proxy timeout, so
 *  the backend responds immediately with just this — not the finished
 *  result — and keeps working in the background. useRunBackupNow polls
 *  listBackups() afterward to notice the new file. */
export interface BackupStartResult {
  ok: boolean;
  started: true;
}

export function listBackups() {
  return api.get<{ backups: BackupItem[]; retentionCount: number }>('/api/admin/backup');
}

export function runBackupNow() {
  return api.post<BackupStartResult>('/api/admin/backup');
}

export interface RestoreResult {
  ok: boolean;
  restoredFrom: string;
  relations?: number;
}

/** DESTRUCTIVE — replaces the live database with this backup. Step-up
 *  protected server-side (requireFreshAuth): a session older than the
 *  freshness window gets a 403 STEP_UP_REQUIRED even for an ADMIN. */
export function restoreBackup(id: string) {
  return api.post<RestoreResult>(`/api/admin/backup/${encodeURIComponent(id)}/restore`);
}

export interface DriveConnectionStatus {
  configured: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
}

export function getDriveStatus() {
  return api.get<DriveConnectionStatus>('/api/admin/backup/drive/status');
}

/** Returns the Google consent URL to navigate the whole tab to
 *  (`window.location.href = url`) — the consent screen must be a top-level
 *  page, this can't be done as a background fetch. Google redirects back to
 *  this same admin page once done (see backup.routes.ts's /drive/callback). */
export function getDriveConnectUrl() {
  return api.get<{ url: string }>('/api/admin/backup/drive/connect').then((r) => r.url);
}

export function disconnectDrive() {
  return api.post<{ ok: true }>('/api/admin/backup/drive/disconnect');
}

export type BackupFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface BackupScheduleStatus {
  due: boolean;
  frequency: BackupFrequency;
  lastBackupAt: string | null;
  nextDueAt: string | null;
}

/** Current cadence plus schedule status — the scheduled GitHub Actions run
 *  fires daily but only actually backs up once this interval has elapsed
 *  since the newest Drive backup (default weekly). */
export function getBackupSettings() {
  return api.get<BackupScheduleStatus>('/api/admin/backup/settings');
}

export function updateBackupSettings(frequency: BackupFrequency) {
  return api.patch<{ frequency: BackupFrequency }>('/api/admin/backup/settings', { frequency });
}
