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

export function useRunBackupNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backupApi.runBackupNow(),
    onSettled: () => qc.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backupApi.restoreBackup(id),
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
