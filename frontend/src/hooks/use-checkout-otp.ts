'use client';

import { useMutation } from '@tanstack/react-query';
import { checkoutOtpApi } from '@/lib/api';

export function useRequestCheckoutOtp() {
  return useMutation({
    mutationFn: ({ email, captchaToken }: { email: string; captchaToken: string }) =>
      checkoutOtpApi.requestOtp(email, captchaToken),
  });
}

export function useVerifyCheckoutOtp() {
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) => checkoutOtpApi.verifyOtp(email, code),
  });
}
