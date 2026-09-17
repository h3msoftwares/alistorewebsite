import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { useGmailStatus, useConnectGmail, useDisconnectGmail } from './use-mail-gmail';
import { GMAIL_CONNECT_MESSAGE_SOURCE } from '@/lib/gmail-connect-message';

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    gmailMailApi: {
      getGmailStatus: vi.fn(),
      getGmailConnectUrl: vi.fn(),
      disconnectGmail: vi.fn(),
    },
  };
});

import { gmailMailApi } from '@/lib/api';
const mockApi = vi.mocked(gmailMailApi, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useGmailStatus', () => {
  it('reads the connection status', async () => {
    mockApi.getGmailStatus.mockResolvedValue({ configured: true, connectedEmail: 'a@gmail.com', connectedAt: null });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGmailStatus(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.connectedEmail).toBe('a@gmail.com'));
  });
});

describe('useDisconnectGmail', () => {
  it('calls through with no args', async () => {
    mockApi.disconnectGmail.mockResolvedValue({ ok: true });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDisconnectGmail(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockApi.disconnectGmail).toHaveBeenCalledTimes(1);
  });
});

describe('useConnectGmail', () => {
  it('rejects immediately when the popup was blocked (never opened)', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectGmail(), { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(null)).rejects.toThrow(/popup/i);
    });
    expect(mockApi.getGmailConnectUrl).not.toHaveBeenCalled();
  });

  it('navigates the popup to the consent URL, then resolves on a matching postMessage', async () => {
    mockApi.getGmailConnectUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const popup = { closed: false, location: { href: '' } } as unknown as Window;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectGmail(), { wrapper: Wrapper });

    let promise!: Promise<string>;
    act(() => {
      promise = result.current.mutateAsync(popup);
    });
    await waitFor(() => expect(popup.location.href).toContain('accounts.google.com'));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { source: GMAIL_CONNECT_MESSAGE_SOURCE, result: 'connected' },
        })
      );
    });

    await expect(promise).resolves.toBe('connected');
  });

  it('ignores a postMessage from an unrelated source', async () => {
    mockApi.getGmailConnectUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const popup = { closed: false, location: { href: '' } } as unknown as Window;
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectGmail(), { wrapper: Wrapper });

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
          data: { source: GMAIL_CONNECT_MESSAGE_SOURCE, result: 'connected' },
        })
      );
    });

    await expect(promise).resolves.toBe('connected');
  });
});
