import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { selectAuthStatus, selectAuthUser } from '@/store/slices/authSlice';
import { useAuth, useAuthBootstrap, useLogin, useRegister, useLogout } from './use-auth';

vi.mock('@/lib/api', () => ({
  authApi: { login: vi.fn(), register: vi.fn(), logout: vi.fn() },
  accountApi: { getProfile: vi.fn() },
  setAccessToken: vi.fn(),
}));
vi.mock('@/lib/api/client', () => ({ refreshAccessToken: vi.fn() }));

import { authApi, accountApi, setAccessToken } from '@/lib/api';
import { refreshAccessToken } from '@/lib/api/client';

const mockAuth = vi.mocked(authApi, true);
const mockAccount = vi.mocked(accountApi, true);
const mockSetToken = vi.mocked(setAccessToken);
const mockRefresh = vi.mocked(refreshAccessToken);

const user = { id: 'u1', name: 'Ali', email: 'a@x.dev', phone: null, role: 'CUSTOMER' as const };

beforeEach(() => vi.clearAllMocks());

describe('useLogin', () => {
  it('stores the token, loads the profile, and marks the session authenticated', async () => {
    mockAuth.login.mockResolvedValue({ accessToken: 'tok-1' });
    mockAccount.getProfile.mockResolvedValue({ ...user, isActive: true, dateCreated: 'now' } as never);

    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => useLogin(), { wrapper: Wrapper });

    await result.current.mutateAsync({ identifier: 'a@x.dev', password: 'pw' });

    expect(mockAuth.login).toHaveBeenCalledWith({ identifier: 'a@x.dev', password: 'pw' });
    expect(mockSetToken).toHaveBeenCalledWith('tok-1');
    expect(selectAuthStatus(store.getState())).toBe('authenticated');
    expect(selectAuthUser(store.getState())?.id).toBe('u1');
  });
});

describe('useRegister', () => {
  it('signs the new account straight in', async () => {
    mockAuth.register.mockResolvedValue({ accessToken: 'tok-2' } as never);
    mockAccount.getProfile.mockResolvedValue({ ...user, isActive: true, dateCreated: 'now' } as never);

    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => useRegister(), { wrapper: Wrapper });

    await result.current.mutateAsync({ name: 'Ali', email: 'a@x.dev', password: 'password1' });

    expect(mockSetToken).toHaveBeenCalledWith('tok-2');
    expect(selectAuthStatus(store.getState())).toBe('authenticated');
  });
});

describe('useLogout', () => {
  it('clears the token and the store even if the API call is a no-op', async () => {
    mockAuth.logout.mockResolvedValue(undefined);
    const { Wrapper, store } = createWrapper();
    // start signed in
    store.dispatch({ type: 'auth/authenticated', payload: user });

    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });
    await result.current.mutateAsync();

    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(selectAuthStatus(store.getState())).toBe('guest');
  });
});

describe('useAuthBootstrap', () => {
  it('restores the session when the refresh cookie is still valid', async () => {
    mockRefresh.mockResolvedValue(true);
    mockAccount.getProfile.mockResolvedValue({ ...user, isActive: true, dateCreated: 'now' } as never);

    const { Wrapper, store } = createWrapper();
    renderHook(() => useAuthBootstrap(), { wrapper: Wrapper });

    await waitFor(() => expect(selectAuthStatus(store.getState())).toBe('authenticated'));
    expect(selectAuthUser(store.getState())?.id).toBe('u1');
  });

  it('falls back to guest when there is no session', async () => {
    mockRefresh.mockResolvedValue(false);
    const { Wrapper, store } = createWrapper();
    renderHook(() => useAuthBootstrap(), { wrapper: Wrapper });

    await waitFor(() => expect(selectAuthStatus(store.getState())).toBe('guest'));
    expect(mockAccount.getProfile).not.toHaveBeenCalled();
  });

  it('falls back to guest when the profile fetch fails', async () => {
    mockRefresh.mockResolvedValue(true);
    mockAccount.getProfile.mockRejectedValue(new Error('boom'));
    const { Wrapper, store } = createWrapper();
    renderHook(() => useAuthBootstrap(), { wrapper: Wrapper });

    await waitFor(() => expect(selectAuthStatus(store.getState())).toBe('guest'));
  });
});

describe('useAuth', () => {
  it('derives flags from the auth slice', async () => {
    const { Wrapper, store } = createWrapper();
    store.dispatch({ type: 'auth/authenticated', payload: { ...user, role: 'ADMIN' } });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });
});
