'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  authenticated,
  loggedOut,
  selectAuthStatus,
  selectAuthUser,
  selectIsAdmin,
} from '@/store/slices/authSlice';
import { resetItemCount } from '@/store/slices/cartSlice';
import { accountApi, authApi, setAccessToken } from '@/lib/api';
import { refreshAccessToken } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import type { LoginBody, RegisterBody } from '@/lib/types';

export function useAuth() {
  const user = useAppSelector(selectAuthUser);
  const status = useAppSelector(selectAuthStatus);
  const isAdmin = useAppSelector(selectIsAdmin);
  return {
    user,
    status,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    isAdmin,
  };
}

/** Mount once near the app root. Exchanges the refresh cookie for an access
 *  token and loads the profile so a hard refresh keeps the session. */
export function useAuthBootstrap() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);

  useEffect(() => {
    if (status !== 'loading') return;
    let cancelled = false;

    (async () => {
      const ok = await refreshAccessToken();
      if (cancelled) return;
      if (!ok) {
        dispatch(loggedOut());
        return;
      }
      try {
        const profile = await accountApi.getProfile();
        if (!cancelled) dispatch(authenticated(profile));
      } catch {
        if (!cancelled) dispatch(loggedOut());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, dispatch]);
}

export function useLogin() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginBody) => {
      const { accessToken } = await authApi.login(body);
      setAccessToken(accessToken);
      return accountApi.getProfile();
    },
    onSuccess: (profile) => {
      dispatch(authenticated(profile));
      qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      qc.invalidateQueries({ queryKey: queryKeys.addresses.all() });
    },
  });
}

export function useRegister() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterBody) => {
      const { accessToken } = await authApi.register(body);
      setAccessToken(accessToken);
      return accountApi.getProfile();
    },
    onSuccess: (profile) => {
      dispatch(authenticated(profile));
      qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
    },
  });
}

export function useLogout() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      setAccessToken(null);
      dispatch(loggedOut());
      dispatch(resetItemCount());
      qc.clear();
    },
  });
}
