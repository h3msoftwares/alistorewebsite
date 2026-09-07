import { api } from './client';

export function requestOtp(email: string, captchaToken: string) {
  return api.post<void>('/api/checkout/otp/request', { email, captchaToken });
}

export function verifyOtp(email: string, code: string) {
  return api.post<{ verifyToken: string }>('/api/checkout/otp/verify', { email, code }).then((r) => r.verifyToken);
}
