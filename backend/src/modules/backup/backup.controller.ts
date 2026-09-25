import { Request, Response } from 'express';
import { env } from '../../config/env';
import { recordAudit } from '../../lib/audit';
import * as backupService from './backup.service';
import { signConnectState, verifyConnectState } from './drive-state';

const DRIVE_CALLBACK_PATH = '/api/admin/backup/drive/callback';
function driveRedirectUri(): string {
  return `${env.BACKEND_URL}${DRIVE_CALLBACK_PATH}`;
}
// A tiny page — deliberately OUTSIDE the /admin subtree, so it never goes
// through AdminLayout's own auth bootstrap/role redirect — that posts the
// result to `window.opener` and closes itself (see useConnectDrive on the
// frontend). Runs in the popup this whole OAuth round-trip happens in, never
// in the admin's main tab, so nothing about the admin's own session/page
// state is ever disturbed by it. No locale prefix needed — proxy.ts
// redirects a bare path to the default locale automatically.
function drivePopupCloserUrl(result: 'connected' | 'error'): string {
  return `${env.FRONTEND_URL}/drive-connect-result?result=${result}`;
}

/**
 * A real dump + Drive upload can run well past Netlify's 26s proxy-rewrite
 * timeout (confirmed live: the backup completed and landed on Drive, but the
 * browser still got a failed request because Netlify's edge gave up on the
 * connection first) — Netlify's own docs recommend exactly this pattern for
 * a long-running origin call: respond immediately, do the work in the
 * background. The frontend polls GET /api/admin/backup afterward to notice
 * the new file (see useRunBackupNow) instead of waiting on this response.
 */
export async function runBackupHandler(req: Request, res: Response) {
  res.status(202).json({ ok: true, started: true });

  const actorID = req.user!.id;
  backupService
    .runBackup('manual')
    .then((result) =>
      recordAudit({
        entityType: 'Backup',
        entityID: result.file?.driveId ?? 'manual',
        action: 'backup.run',
        actorID,
        metadata: { file: result.file?.name, bytes: result.file?.bytes, pruned: result.pruned },
      })
    )
    .catch((err: Error) => {
      // recordAudit alone left this failure invisible in Railway's logs —
      // confirmed live: a failed backup showed nothing there to diagnose,
      // only a silent audit row (readable via direct DB access only, which
      // this app's own API doesn't expose and isn't something to reach for
      // casually against production). console.error is the same
      // fire-and-forget background job, so it can't affect the already-sent
      // 202 response either way.
      console.error('[backup] manual run failed:', err);
      return recordAudit({
        entityType: 'Backup',
        entityID: 'manual',
        action: 'backup.run.failed',
        actorID,
        metadata: { error: err.message },
      });
    });
}

export async function listBackupsHandler(_req: Request, res: Response) {
  const backups = await backupService.listBackups();
  res.json({ backups, retentionCount: env.BACKUP_RETENTION_COUNT });
}

export interface RestoreStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  id?: string;
  at?: string;
  relations?: number;
  error?: string;
}

// In-memory — fine for this app's single Railway instance (same assumption
// other in-process state here already makes, e.g. checkout-otp's rate
// limiter). Lets the frontend poll for a restore's real outcome instead of
// waiting on the triggering request itself: a download + pg_restore can run
// past Netlify's 26s proxy-rewrite timeout, the exact same problem
// runBackupHandler below already solves for backups (confirmed live: the
// restore completed but the browser still saw the POST fail).
let restoreStatus: RestoreStatus = { state: 'idle' };

export async function getRestoreStatusHandler(_req: Request, res: Response) {
  res.json(restoreStatus);
}

/** DESTRUCTIVE — replaces the live database. Gated upstream by
 *  requireRole('ADMIN'), requireFreshAuth() (step-up) and a tight rate
 *  limit (see backup.routes.ts); every attempt is audit-logged here,
 *  success or failure. Responds as soon as the restore has STARTED (see
 *  restoreStatus above) — the frontend polls GET /restore-status for when
 *  it actually finishes. */
export async function restoreBackupHandler(req: Request, res: Response) {
  // Already shape-validated by backupIdParamSchema (validate middleware).
  const id = req.params.id as string;
  const actorID = req.user!.id;
  const at = new Date().toISOString();

  // Set BEFORE responding: the frontend only starts polling once this 202
  // has come back, so by then the state is guaranteed to already be
  // 'running' — no window where a poll could still see stale 'idle'/'done'
  // from a previous restore.
  restoreStatus = { state: 'running', id, at };
  res.status(202).json({ ok: true, started: true });

  backupService
    .restoreBackup(id)
    .then(async (result) => {
      restoreStatus = { state: 'done', id, at, relations: result.relations };
      await recordAudit({
        entityType: 'Backup',
        entityID: id,
        action: 'backup.restore',
        actorID,
        metadata: { relations: result.relations },
      });
    })
    .catch(async (err: Error) => {
      // Same reasoning as runBackupHandler's catch — recordAudit alone left
      // a restore failure invisible in Railway's logs.
      console.error('[backup] restore failed:', err);
      restoreStatus = { state: 'error', id, at, error: err.message };
      await recordAudit({
        entityType: 'Backup',
        entityID: id,
        action: 'backup.restore.failed',
        actorID,
        metadata: { error: err.message },
      });
    });
}

// ---- Google Drive connection ----

export async function driveStatusHandler(_req: Request, res: Response) {
  res.json(await backupService.getDriveStatus());
}

/** Returns the Google consent URL — the frontend opens it in a popup window
 *  (`window.open`), not the main tab: the consent screen must be a top-level
 *  page, but it doesn't have to be THIS page, and keeping it out of the main
 *  tab means the admin's own session/SPA state is never disturbed by the
 *  round-trip (see useConnectDrive on the frontend). */
export async function driveConnectHandler(req: Request, res: Response) {
  const state = signConnectState(req.user!.id);
  const url = backupService.buildDriveAuthUrl(driveRedirectUri(), state);
  res.json({ url });
}

/** Google redirects here after consent — a plain top-level GET with no auth
 *  header, so this route is intentionally NOT behind requireAuth/requireRole
 *  (see backup.routes.ts); `state` is the actual gate (drive-state.ts). This
 *  request happens inside the popup opened by useConnectDrive, never the
 *  admin's main tab — it always ends by sending the popup to a tiny page
 *  that reports the result back via postMessage and closes itself. */
export async function driveCallbackHandler(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const closePopup = (result: 'connected' | 'error') => res.redirect(drivePopupCloserUrl(result));

  if (error) return closePopup('error');
  if (typeof code !== 'string' || typeof state !== 'string') return closePopup('error');

  const adminId = verifyConnectState(state);
  if (!adminId) return closePopup('error');

  try {
    const { email } = await backupService.completeDriveConnection(code, driveRedirectUri());
    await recordAudit({
      entityType: 'Backup',
      entityID: 'drive',
      action: 'backup.drive.connect',
      actorID: adminId,
      metadata: { email },
    });
    return closePopup('connected');
  } catch (err) {
    await recordAudit({
      entityType: 'Backup',
      entityID: 'drive',
      action: 'backup.drive.connect.failed',
      actorID: adminId,
      metadata: { error: (err as Error).message },
    });
    return closePopup('error');
  }
}

export async function driveDisconnectHandler(req: Request, res: Response) {
  await backupService.disconnectDrive();
  await recordAudit({
    entityType: 'Backup',
    entityID: 'drive',
    action: 'backup.drive.disconnect',
    actorID: req.user!.id,
  });
  res.json({ ok: true });
}

// ---- Automatic-backup schedule ----

/** Current frequency plus schedule status (last/next due) in one call — the
 *  admin panel's "Backup schedule" card needs both. */
export async function getBackupSettingsHandler(_req: Request, res: Response) {
  res.json(await backupService.isBackupDueNow());
}

export async function updateBackupSettingsHandler(req: Request, res: Response) {
  const { frequency } = req.body as { frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' };
  const settings = await backupService.updateBackupSettings(frequency);
  await recordAudit({
    entityType: 'Backup',
    entityID: 'settings',
    action: 'backup.settings.update',
    actorID: req.user!.id,
    metadata: { frequency: settings.frequency },
  });
  res.json(settings);
}
