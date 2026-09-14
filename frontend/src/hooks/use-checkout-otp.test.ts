import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { useRequestCheckoutOtp, useVerifyCheckoutOtp } from './use-checkout-otp';

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    checkoutOtpApi: { requestOtp: vi.fn(), verifyOtp: vi.fn() },
  };
});

import { checkoutOtpApi } from '@/lib/api';
const mockApi = vi.mocked(checkoutOtpApi, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRequestCheckoutOtp', () => {
  it('calls through with the email and captcha token', async () => {
    mockApi.requestOtp.mockResolvedValue(undefined as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRequestCheckoutOtp(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ email: 'shopper@test.dev', captchaToken: 'tok-123' });
    });

    expect(mockApi.requestOtp).toHaveBeenCalledWith('shopper@test.dev', 'tok-123');
  });
});

describe('useVerifyCheckoutOtp', () => {
  it('calls through with the email and code', async () => {
    mockApi.verifyOtp.mockResolvedValue(undefined as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVerifyCheckoutOtp(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ email: 'shopper@test.dev', code: '123456' });
    });

    expect(mockApi.verifyOtp).toHaveBeenCalledWith('shopper@test.dev', '123456');
  });
});
