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
import type { ForgotPasswordBody, LoginBody, RegisterBody, ResetPasswordBody } from '@/lib/types';

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

/** Admin-panel sign-in. Mirrors `useLogin` (verify → prime token → load
 *  profile → mark authenticated) but hits POST /api/auth/admin-login and does
 *  no cart work — the admin flow isn't a storefront session. The backend only
 *  returns 200 for a STAFF/ADMIN account, so a resolved profile here is
 *  already an admin. */
export function useAdminLogin() {
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: async (body: LoginBody) => {
      const { accessToken } = await authApi.adminLogin(body);
      setAccessToken(accessToken);
      return accountApi.getProfile();
    },
    onSuccess: (profile) => {
      dispatch(authenticated(profile));
    },
  });
}

/** No session side-effects — just wraps the request for loading/error state.
 *  The response is identical whether or not the email matches an account;
 *  the form must not infer anything from success vs failure beyond
 *  "request accepted" vs "network/rate-limit problem". */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordBody) => authApi.forgotPassword(body),
  });
}

/** Also no session side-effects — a reset doesn't log the browser in, it just
 *  revokes every existing session server-side. The caller re-authenticates
 *  via useLogin/useAdminLogin afterward. */
export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordBody) => authApi.resetPassword(body),
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
