import { api } from './client';
import type {
  AuthUser,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResendVerificationBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '../types';

/** Never returns a session — the response is a generic message whether or not
 *  the email was already in use. The user verifies via the emailed link, then
 *  logs in. */
export function register(body: RegisterBody) {
  return api.post<{ message: string }>('/api/auth/register', body, { auth: false });
}

export function verifyEmail(body: VerifyEmailBody) {
  return api.post<{ message: string }>('/api/auth/verify-email', body, { auth: false });
}

/** Same generic response as `register` — never branch UI on it. */
export function resendVerification(body: ResendVerificationBody) {
  return api.post<{ message: string }>('/api/auth/resend-verification', body, { auth: false });
}

export function login(body: LoginBody) {
  return api.post<{ accessToken: string }>('/api/auth/login', body, { auth: false });
}

/** Admin-panel login. Separate endpoint with a stricter rate limit + a
 *  server-side STAFF/ADMIN gate; identical response shape to `login`. */
export function adminLogin(body: LoginBody) {
  return api.post<{ accessToken: string }>('/api/auth/admin-login', body, { auth: false });
}

/** Always resolves with the same generic message whether or not the email
 *  matches an account — the backend guarantees that; never branch UI on
 *  which account exists from this response. */
export function forgotPassword(body: ForgotPasswordBody) {
  return api.post<{ message: string }>('/api/auth/forgot-password', body, { auth: false });
}

export function resetPassword(body: ResetPasswordBody) {
  return api.post<{ message: string }>('/api/auth/reset-password', body, { auth: false });
}

export function logout() {
  return api.post<void>('/api/auth/logout', undefined, { auth: false });
}

/** Exchanges the refresh cookie for a fresh access token. */
export function refresh() {
  return api.post<{ accessToken: string }>('/api/auth/refresh', undefined, { auth: false });
}

export type { AuthUser };
