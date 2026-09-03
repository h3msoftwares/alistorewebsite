'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAppDispatch } from '@/store/hooks';
import { authenticated } from '@/store/slices/authSlice';
import type { AddressBody, ProfileBody, UUID } from '@/lib/types';

// ---- Addresses ----

export function useAddresses(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.addresses.list(),
    queryFn: accountApi.listAddresses,
    enabled: opts?.enabled ?? true,
  });
}

export function useAddress(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.addresses.detail(id ?? ''),
    queryFn: () => accountApi.getAddress(id as UUID),
    enabled: Boolean(id),
  });
}

function useAddressesInvalidator() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.addresses.all() });
}

export function useCreateAddress() {
  const invalidate = useAddressesInvalidator();
  return useMutation({
    mutationFn: (body: AddressBody) => accountApi.createAddress(body),
    onSuccess: invalidate,
  });
}

export function useUpdateAddress() {
  const invalidate = useAddressesInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<AddressBody> }) =>
      accountApi.updateAddress(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAddress() {
  const invalidate = useAddressesInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => accountApi.deleteAddress(id),
    onSuccess: invalidate,
  });
}

// ---- Profile ----

export function useProfile(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.auth.profile(),
    queryFn: accountApi.getProfile,
    enabled: opts?.enabled ?? true,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (body: ProfileBody) => accountApi.updateProfile(body),
    onSuccess: (user) => {
      qc.setQueryData(queryKeys.auth.profile(), user);
      dispatch(authenticated(user));
    },
  });
}
