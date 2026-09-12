'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '@/lib/api';
import type { BackupFrequency } from '@/lib/api/backup';

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

/** Fetches the consent URL then navigates the whole tab to it — Google's
 *  OAuth screen must be a top-level page, not something opened via fetch. */
export function useConnectDrive() {
  return useMutation({
    mutationFn: async () => {
      const url = await backupApi.getDriveConnectUrl();
      window.location.href = url;
    },
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
