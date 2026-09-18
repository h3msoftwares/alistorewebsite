'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '@/lib/api';
import type { BackupFrequency } from '@/lib/api/backup';
import { DRIVE_CONNECT_MESSAGE_SOURCE, type DriveConnectMessage } from '@/lib/drive-connect-message';

const BACKUPS_KEY = ['backup', 'list'] as const;
const DRIVE_STATUS_KEY = ['backup', 'drive', 'status'] as const;
const SETTINGS_KEY = ['backup', 'settings'] as const;

export function useBackups() {
  return useQuery({ queryKey: BACKUPS_KEY, queryFn: backupApi.listBackups });
}

export type BackupRunOutcome =
  | { ok: true; file: import('@/lib/api/backup').BackupItem }
  | { ok: false; timedOut: true };

/**
 * A real dump + Drive upload can run well past Netlify's proxy timeout
 * (26s — confirmed live: the backup completed and landed on Drive, but the
 * browser still saw the request fail because Netlify's edge gave up first).
 * The POST now only confirms the backup STARTED (see BackupStartResult) —
 * this polls listBackups() afterward for a file that wasn't there before,
 * so the button's loading state and the eventual success/failure message
 * reflect when the backup actually finishes, not when the request that
 * kicked it off returned.
 */
export function useRunBackupNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<BackupRunOutcome> => {
      const before = await backupApi.listBackups();
      const beforeNames = new Set(before.backups.map((b) => b.name));
      await backupApi.runBackupNow();

      const POLL_INTERVAL_MS = 4000;
      const MAX_WAIT_MS = 3 * 60_000;
      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const after = await backupApi.listBackups();
        const fresh = after.backups.find((b) => !beforeNames.has(b.name));
        if (fresh) return { ok: true, file: fresh };
      }
      return { ok: false, timedOut: true };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

export type RestoreOutcome =
  | { ok: true; relations?: number }
  | { ok: false; timedOut: true }
  | { ok: false; error: string };

/**
 * A real Drive download + pg_restore can run well past Netlify's 26s proxy
 * timeout too (same problem, and same fix, as useRunBackupNow above) — the
 * POST only confirms the restore STARTED, and this polls GET
 * /restore-status afterward for the actual outcome. There's no new listable
 * file to diff against here (unlike a backup), so the backend tracks the
 * status itself; `status.id === id` guards against ever reading a stale
 * result left over from an earlier restore.
 */
export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<RestoreOutcome> => {
      await backupApi.restoreBackup(id);

      const POLL_INTERVAL_MS = 4000;
      const MAX_WAIT_MS = 3 * 60_000;
      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const status = await backupApi.getRestoreStatus();
        if (status.id !== id) continue;
        if (status.state === 'done') return { ok: true, relations: status.relations };
        if (status.state === 'error') return { ok: false, error: status.error ?? 'Restore failed.' };
      }
      return { ok: false, timedOut: true };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

export function useDriveStatus() {
  return useQuery({ queryKey: DRIVE_STATUS_KEY, queryFn: backupApi.getDriveStatus });
}

/**
 * Runs the whole Google Drive OAuth round-trip in a POPUP window instead of
 * navigating the admin's own tab away. That matters: a full-tab navigation
 * to Google and back forces the SPA to reload from scratch, wiping the
 * in-memory access token and leaving the admin's session to be silently
 * reconstructed from the refresh cookie — a page reload the admin never
 * asked for, and a real way to end up looking "logged out" mid-connect.
 * A popup keeps the main tab (and its session) completely untouched; the
 * popup itself reports back via postMessage from drive-connect-result/page.tsx
 * and then closes itself.
 *
 * `popup` must already be open (via `window.open`) BEFORE this mutation
 * starts — opening it here, after an await, risks the browser's popup
 * blocker treating it as unrelated to the click that triggered it.
 */
export function useConnectDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (popup: Window | null) => {
      if (!popup) {
        throw new Error('Popup blocked — allow popups for this site and try again.');
      }
      return new Promise<'connected' | 'error' | 'cancelled'>((resolve, reject) => {
        let settled = false;
        const finish = (value: 'connected' | 'error' | 'cancelled') => {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          window.clearInterval(pollId);
          resolve(value);
        };

        function onMessage(e: MessageEvent<DriveConnectMessage>) {
          if (e.origin !== window.location.origin) return;
          if (e.data?.source !== DRIVE_CONNECT_MESSAGE_SOURCE) return;
          finish(e.data.result);
        }
        window.addEventListener('message', onMessage);

        // Fallback for a user who closes the popup manually before it ever
        // posts a message (e.g. backing out of the consent screen entirely).
        const pollId = window.setInterval(() => {
          if (popup.closed) finish('cancelled');
        }, 500);

        backupApi.getDriveConnectUrl().then(
          (url) => {
            popup.location.href = url;
          },
          (err) => {
            if (settled) return;
            settled = true;
            window.removeEventListener('message', onMessage);
            window.clearInterval(pollId);
            popup.close();
            reject(err);
          }
        );
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVE_STATUS_KEY }),
  });
}

export function useDisconnectDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backupApi.disconnectDrive(),
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVE_STATUS_KEY }),
  });
}

export function useBackupSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: backupApi.getBackupSettings });
}

export function useUpdateBackupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (frequency: BackupFrequency) => backupApi.updateBackupSettings(frequency),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}
