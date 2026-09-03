import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { queryKeys } from '@/lib/query-keys';
import { selectAuthUser } from '@/store/slices/authSlice';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useProfile,
  useUpdateProfile,
} from './use-account';

vi.mock('@/lib/api', () => ({
  accountApi: {
    listAddresses: vi.fn(),
    getAddress: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    deleteAddress: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

import { accountApi } from '@/lib/api';
const mockAccount = vi.mocked(accountApi, true);

beforeEach(() => vi.clearAllMocks());

describe('addresses', () => {
  it('useAddresses fetches the list', async () => {
    mockAccount.listAddresses.mockResolvedValue([{ id: 'a1' }] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAddresses(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'a1' }]));
  });

  it('useCreateAddress invalidates the address list', async () => {
    mockAccount.createAddress.mockResolvedValue({ id: 'a2' } as never);
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateAddress(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      fullName: 'A',
      phone: '079',
      addressLine: 'street',
      city: 'Amman',
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.addresses.all() });
  });

  it('useDeleteAddress passes the id and invalidates', async () => {
    mockAccount.deleteAddress.mockResolvedValue(undefined as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteAddress(), { wrapper: Wrapper });
    await result.current.mutateAsync('a9');
    expect(mockAccount.deleteAddress).toHaveBeenCalledWith('a9');
  });
});

describe('profile', () => {
  it('useProfile fetches the current user', async () => {
    mockAccount.getProfile.mockResolvedValue({ id: 'u1', name: 'Ali' } as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject({ id: 'u1' }));
  });

  it('useUpdateProfile writes through to cache and the auth slice', async () => {
    const updated = { id: 'u1', name: 'New Name', email: 'a@x.dev', phone: '079', role: 'CUSTOMER' };
    mockAccount.updateProfile.mockResolvedValue(updated as never);

    const { Wrapper, store, queryClient } = createWrapper();
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: Wrapper });

    await result.current.mutateAsync({ name: 'New Name' });

    expect(mockAccount.updateProfile).toHaveBeenCalledWith({ name: 'New Name' });
    expect(queryClient.getQueryData(queryKeys.auth.profile())).toMatchObject({ name: 'New Name' });
    expect(selectAuthUser(store.getState())?.name).toBe('New Name');
  });
});
