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
      getRestoreStatus: vi.fn(),
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
  it('useRunBackupNow starts the backup, then polls listBackups until the new file appears', async () => {
    vi.useFakeTimers();
    const before = { id: '1', name: 'old.dump', bytes: 1, createdAt: 'x' };
    const fresh = { id: '2', name: 'new.dump', bytes: 2, createdAt: 'y' };
    mockApi.listBackups
      .mockResolvedValueOnce({ backups: [before], retentionCount: 7 })
      .mockResolvedValueOnce({ backups: [before, fresh], retentionCount: 7 });
    mockApi.runBackupNow.mockResolvedValue({ ok: true, started: true });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRunBackupNow(), { wrapper: Wrapper });

    let promise!: ReturnType<typeof result.current.mutateAsync>;
    act(() => {
      promise = result.current.mutateAsync();
    });
    await act(() => vi.advanceTimersByTimeAsync(4000));

    await expect(promise).resolves.toEqual({ ok: true, file: fresh });
    expect(mockApi.runBackupNow).toHaveBeenCalledTimes(1);
    expect(mockApi.listBackups).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('useRunBackupNow reports timedOut if no new file shows up within the poll window', async () => {
    vi.useFakeTimers();
    const before = { id: '1', name: 'old.dump', bytes: 1, createdAt: 'x' };
    mockApi.listBackups.mockResolvedValue({ backups: [before], retentionCount: 7 });
    mockApi.runBackupNow.mockResolvedValue({ ok: true, started: true });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRunBackupNow(), { wrapper: Wrapper });

    let promise!: ReturnType<typeof result.current.mutateAsync>;
    act(() => {
      promise = result.current.mutateAsync();
    });
    await act(() => vi.advanceTimersByTimeAsync(3 * 60_000));

    await expect(promise).resolves.toEqual({ ok: false, timedOut: true });
    vi.useRealTimers();
  });

  it('useRestoreBackup starts the restore, then polls restore-status until done', async () => {
    vi.useFakeTimers();
    mockApi.restoreBackup.mockResolvedValue({ ok: true, started: true });
    mockApi.getRestoreStatus
      .mockResolvedValueOnce({ state: 'running', id: 'backup-1' })
      .mockResolvedValueOnce({ state: 'done', id: 'backup-1', relations: 12 });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRestoreBackup(), { wrapper: Wrapper });

    let promise!: ReturnType<typeof result.current.mutateAsync>;
    act(() => {
      promise = result.current.mutateAsync('backup-1');
    });
    await act(() => vi.advanceTimersByTimeAsync(8000));

    await expect(promise).resolves.toEqual({ ok: true, relations: 12 });
    expect(mockApi.restoreBackup).toHaveBeenCalledWith('backup-1');
    vi.useRealTimers();
  });

  it('useRestoreBackup reports the backend error once restore-status reports failure', async () => {
    vi.useFakeTimers();
    mockApi.restoreBackup.mockResolvedValue({ ok: true, started: true });
    mockApi.getRestoreStatus.mockResolvedValue({ state: 'error', id: 'backup-1', error: 'pg_restore exploded' });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRestoreBackup(), { wrapper: Wrapper });

    let promise!: ReturnType<typeof result.current.mutateAsync>;
    act(() => {
      promise = result.current.mutateAsync('backup-1');
    });
    await act(() => vi.advanceTimersByTimeAsync(4000));

    await expect(promise).resolves.toEqual({ ok: false, error: 'pg_restore exploded' });
    vi.useRealTimers();
  });

  it('useRestoreBackup ignores a status entry left over from a different restore id', async () => {
    vi.useFakeTimers();
    mockApi.restoreBackup.mockResolvedValue({ ok: true, started: true });
    mockApi.getRestoreStatus
      .mockResolvedValueOnce({ state: 'done', id: 'stale-id', relations: 1 })
      .mockResolvedValueOnce({ state: 'done', id: 'backup-1', relations: 12 });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRestoreBackup(), { wrapper: Wrapper });

    let promise!: ReturnType<typeof result.current.mutateAsync>;
    act(() => {
      promise = result.current.mutateAsync('backup-1');
    });
    await act(() => vi.advanceTimersByTimeAsync(8000));

    await expect(promise).resolves.toEqual({ ok: true, relations: 12 });
    vi.useRealTimers();
  });

  it('useRestoreBackup reports timedOut if the status never settles within the poll window', async () => {
    vi.useFakeTimers();
    mockApi.restoreBackup.mockResolvedValue({ ok: true, started: true });
    mockApi.getRestoreStatus.mockResolvedValue({ state: 'running', id: 'backup-1' });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRestoreBackup(), { wrapper: Wrapper });

    let promise!: ReturnType<typeof result.current.mutateAsync>;
    act(() => {
      promise = result.current.mutateAsync('backup-1');
    });
    await act(() => vi.advanceTimersByTimeAsync(3 * 60_000));

    await expect(promise).resolves.toEqual({ ok: false, timedOut: true });
    vi.useRealTimers();
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
