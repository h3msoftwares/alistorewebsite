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
import type {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResendVerificationBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '@/lib/types';

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
 *  profile → mark authenticated) but hits POST /api/auth/ali-admin-login and does
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

/** Registration does NOT log the browser in — the backend only mails a
 *  verification link and returns a generic message that's identical whether
 *  or not the email was already in use. The form shows a "check your email"
 *  state on success; the user verifies, then signs in. */
export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterBody) => authApi.register(body),
  });
}

/** Consumes the token from the /verify-email link. No session side-effects —
 *  the user signs in afterwards. */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: (body: VerifyEmailBody) => authApi.verifyEmail(body),
  });
}

/** Re-request the verification email. Same generic response as register —
 *  the form must not infer anything from it beyond "request accepted". */
export function useResendVerification() {
  return useMutation({
    mutationFn: (body: ResendVerificationBody) => authApi.resendVerification(body),
  });
}

/** Signed-in password change. Verifies the current password server-side,
 *  revokes every other session, and hands back a fresh access token for this
 *  browser — swap it in so the current tab stays logged in. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: ChangePasswordBody) => {
      const { accessToken } = await authApi.changePassword(body);
      setAccessToken(accessToken);
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
