import { api } from './client';
import type { AuthResult, AuthUser, LoginBody, RegisterBody } from '../types';

export function register(body: RegisterBody) {
  return api.post<AuthResult>('/api/auth/register', body, { auth: false });
}

export function login(body: LoginBody) {
  return api.post<{ accessToken: string }>('/api/auth/login', body, { auth: false });
}

export function logout() {
  return api.post<void>('/api/auth/logout', undefined, { auth: false });
}

/** Exchanges the refresh cookie for a fresh access token. */
export function refresh() {
  return api.post<{ accessToken: string }>('/api/auth/refresh', undefined, { auth: false });
}

export type { AuthUser };
