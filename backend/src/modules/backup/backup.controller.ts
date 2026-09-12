import { Request, Response } from 'express';
import { env } from '../../config/env';
import { recordAudit } from '../../lib/audit';
import * as backupService from './backup.service';
import { signConnectState, verifyConnectState } from './drive-state';

const DRIVE_CALLBACK_PATH = '/api/admin/backup/drive/callback';
function driveRedirectUri(): string {
  return `${env.BACKEND_URL}${DRIVE_CALLBACK_PATH}`;
}
// No locale prefix needed — proxy.ts redirects a bare path to the default
// locale automatically.
function driveSettingsPageUrl(): string {
  return `${env.FRONTEND_URL}/admin/backup`;
}

export async function runBackupHandler(req: Request, res: Response) {
  const result = await backupService.runBackup('manual').catch(async (err: Error) => {
    await recordAudit({
      entityType: 'Backup',
      entityID: 'manual',
      action: 'backup.run.failed',
      actorID: req.user!.id,
      metadata: { error: err.message },
    });
    throw err;
  });

  await recordAudit({
    entityType: 'Backup',
    entityID: result.file?.driveId ?? 'manual',
    action: 'backup.run',
    actorID: req.user!.id,
    metadata: { file: result.file?.name, bytes: result.file?.bytes, pruned: result.pruned },
  });

  res.json(result);
}

export async function listBackupsHandler(_req: Request, res: Response) {
  const backups = await backupService.listBackups();
  res.json({ backups, retentionCount: env.BACKUP_RETENTION_COUNT });
}

/** DESTRUCTIVE — replaces the live database. Gated upstream by
 *  requireRole('ADMIN'), requireFreshAuth() (step-up) and a tight rate
 *  limit (see backup.routes.ts); every attempt is audit-logged here,
 *  success or failure. */
export async function restoreBackupHandler(req: Request, res: Response) {
  // Already shape-validated by backupIdParamSchema (validate middleware).
  const id = req.params.id as string;

  const result = await backupService.restoreBackup(id).catch(async (err: Error) => {
    await recordAudit({
      entityType: 'Backup',
      entityID: id,
      action: 'backup.restore.failed',
      actorID: req.user!.id,
      metadata: { error: err.message },
    });
    throw err;
  });

  await recordAudit({
    entityType: 'Backup',
    entityID: id,
    action: 'backup.restore',
    actorID: req.user!.id,
    metadata: { relations: result.relations },
  });

  res.json(result);
}

// ---- Google Drive connection ----

export async function driveStatusHandler(_req: Request, res: Response) {
  res.json(await backupService.getDriveStatus());
}

/** Returns the Google consent URL — the frontend navigates the whole tab to
 *  it (`window.location.href`), it can't be fetched/XHR'd since the consent
 *  screen must be a top-level page. */
export async function driveConnectHandler(req: Request, res: Response) {
  const state = signConnectState(req.user!.id);
  const url = backupService.buildDriveAuthUrl(driveRedirectUri(), state);
  res.json({ url });
}

/** Google redirects here after consent — a plain top-level GET with no auth
 *  header, so this route is intentionally NOT behind requireAuth/requireRole
 *  (see backup.routes.ts); `state` is the actual gate (drive-state.ts).
 *  Either way, always ends by sending the browser back to the admin page. */
export async function driveCallbackHandler(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const back = (query: string) => res.redirect(`${driveSettingsPageUrl()}?${query}`);

  if (error) return back('drive=error');
  if (typeof code !== 'string' || typeof state !== 'string') return back('drive=error');

  const adminId = verifyConnectState(state);
  if (!adminId) return back('drive=error');

  try {
    const { email } = await backupService.completeDriveConnection(code, driveRedirectUri());
    await recordAudit({
      entityType: 'Backup',
      entityID: 'drive',
      action: 'backup.drive.connect',
      actorID: adminId,
      metadata: { email },
    });
    return back('drive=connected');
  } catch (err) {
    await recordAudit({
      entityType: 'Backup',
      entityID: 'drive',
      action: 'backup.drive.connect.failed',
      actorID: adminId,
      metadata: { error: (err as Error).message },
    });
    return back('drive=error');
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
