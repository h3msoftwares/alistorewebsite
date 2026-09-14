import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import {
  useBackups,
  useRunBackupNow,
  useRestoreBackup,
  useDriveStatus,
  useConnectDrive,
  useDisconnectDrive,
  useBackupSettings,
  useUpdateBackupSettings,
} from './use-backup';
import { DRIVE_CONNECT_MESSAGE_SOURCE } from '@/lib/drive-connect-message';

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    backupApi: {
      listBackups: vi.fn(),
      runBackupNow: vi.fn(),
      restoreBackup: vi.fn(),
      getDriveStatus: vi.fn(),
      getDriveConnectUrl: vi.fn(),
      disconnectDrive: vi.fn(),
      getBackupSettings: vi.fn(),
      updateBackupSettings: vi.fn(),
    },
  };
});

import { backupApi } from '@/lib/api';
const mockApi = vi.mocked(backupApi, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('read hooks', () => {
  it('useBackups lists backups', async () => {
    mockApi.listBackups.mockResolvedValue({ backups: [], retentionCount: 7 });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBackups(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ backups: [], retentionCount: 7 }));
  });

  it('useDriveStatus reads the connection status', async () => {
    mockApi.getDriveStatus.mockResolvedValue({ configured: true, connectedEmail: 'a@b.com', connectedAt: null });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDriveStatus(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.configured).toBe(true));
  });

  it('useBackupSettings reads the schedule status', async () => {
    mockApi.getBackupSettings.mockResolvedValue({
      due: false,
      frequency: 'WEEKLY',
      lastBackupAt: null,
      nextDueAt: null,
    });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBackupSettings(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.frequency).toBe('WEEKLY'));
  });
});

describe('write hooks', () => {
  it('useRunBackupNow calls through with no args', async () => {
    mockApi.runBackupNow.mockResolvedValue({ ok: true, at: 'now', trigger: 'manual' });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRunBackupNow(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockApi.runBackupNow).toHaveBeenCalledTimes(1);
  });

  it('useRestoreBackup calls through with the backup id', async () => {
    mockApi.restoreBackup.mockResolvedValue({ ok: true, restoredFrom: 'file.dump' });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRestoreBackup(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync('backup-1');
    });
    expect(mockApi.restoreBackup).toHaveBeenCalledWith('backup-1');
  });

  it('useDisconnectDrive calls through with no args', async () => {
    mockApi.disconnectDrive.mockResolvedValue({ ok: true });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDisconnectDrive(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockApi.disconnectDrive).toHaveBeenCalledTimes(1);
  });

  it('useUpdateBackupSettings calls through with the new frequency', async () => {
    mockApi.updateBackupSettings.mockResolvedValue({ frequency: 'DAILY' });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateBackupSettings(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync('DAILY');
    });
    expect(mockApi.updateBackupSettings).toHaveBeenCalledWith('DAILY');
  });
});

describe('useConnectDrive', () => {
  it('rejects immediately when the popup was blocked (never opened)', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectDrive(), { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(null)).rejects.toThrow(/popup/i);
    });
    expect(mockApi.getDriveConnectUrl).not.toHaveBeenCalled();
  });

  it('navigates the popup to the consent URL, then resolves on a matching postMessage', async () => {
    mockApi.getDriveConnectUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const popup = { closed: false, location: { href: '' } } as unknown as Window;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectDrive(), { wrapper: Wrapper });

    let promise!: Promise<string>;
    act(() => {
      promise = result.current.mutateAsync(popup);
    });
    await waitFor(() => expect(popup.location.href).toContain('accounts.google.com'));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { source: DRIVE_CONNECT_MESSAGE_SOURCE, result: 'connected' },
        })
      );
    });

    await expect(promise).resolves.toBe('connected');
  });

  it('ignores a postMessage from an unrelated source', async () => {
    mockApi.getDriveConnectUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const popup = { closed: false, location: { href: '' } } as unknown as Window;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectDrive(), { wrapper: Wrapper });

    let promise!: Promise<string>;
    act(() => {
      promise = result.current.mutateAsync(popup);
    });
    await waitFor(() => expect(popup.location.href).toContain('accounts.google.com'));

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, data: { unrelated: true } }));
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { source: DRIVE_CONNECT_MESSAGE_SOURCE, result: 'connected' },
        })
      );
    });

    await expect(promise).resolves.toBe('connected');
  });
});
