import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import {
  useLoyaltyRules,
  useCreateLoyaltyRule,
  useUpdateLoyaltyRule,
  useDeleteLoyaltyRule,
} from './use-loyalty';
import type { LoyaltyRule } from '@/lib/types';

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    loyaltyApi: {
      listLoyaltyRules: vi.fn(),
      createLoyaltyRule: vi.fn(),
      updateLoyaltyRule: vi.fn(),
      deleteLoyaltyRule: vi.fn(),
    },
  };
});

import { loyaltyApi } from '@/lib/api';
const mockApi = vi.mocked(loyaltyApi, true);

const rule: LoyaltyRule = {
  id: 'r1',
  nameEn: 'Every 5 orders',
  nameAr: 'كل 5 طلبات',
  metric: 'ORDER_COUNT',
  threshold: '5',
  isActive: true,
  rewardType: 'PERCENT',
  rewardValue: '10',
  couponValidDays: null,
  dateCreated: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLoyaltyRules', () => {
  it('lists rules from the API', async () => {
    mockApi.listLoyaltyRules.mockResolvedValue([rule]);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useLoyaltyRules(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual([rule]));
    expect(mockApi.listLoyaltyRules).toHaveBeenCalledTimes(1);
  });
});

describe('loyalty rule mutations', () => {
  it('useCreateLoyaltyRule calls through with the body and invalidates the list', async () => {
    mockApi.createLoyaltyRule.mockResolvedValue(rule);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateLoyaltyRule(), { wrapper: Wrapper });

    const body = {
      nameEn: 'x',
      nameAr: 'x',
      metric: 'ORDER_COUNT' as const,
      threshold: 5,
      rewardType: 'PERCENT' as const,
      rewardValue: 10,
    };
    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(mockApi.createLoyaltyRule).toHaveBeenCalledWith(body);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loyalty', 'rules'] });
  });

  it('useUpdateLoyaltyRule calls through with id + partial body', async () => {
    mockApi.updateLoyaltyRule.mockResolvedValue(rule);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateLoyaltyRule(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'r1', body: { threshold: 8 } });
    });

    expect(mockApi.updateLoyaltyRule).toHaveBeenCalledWith('r1', { threshold: 8 });
  });

  it('useDeleteLoyaltyRule calls through with the id', async () => {
    mockApi.deleteLoyaltyRule.mockResolvedValue(undefined);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteLoyaltyRule(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('r1');
    });

    expect(mockApi.deleteLoyaltyRule).toHaveBeenCalledWith('r1');
  });
});
