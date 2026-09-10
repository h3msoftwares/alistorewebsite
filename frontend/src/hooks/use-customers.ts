'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CustomerListQuery, UUID } from '@/lib/types';

// ---------------------------------------------------------------- queries ----

export function useAdminCustomers(query: CustomerListQuery) {
  return useQuery({
    queryKey: queryKeys.customers.list(query),
    queryFn: () => customersApi.adminListCustomers(query),
    placeholderData: (prev) => prev, // page/search changes keep the old rows visible
  });
}

export function useAdminCustomer(id: UUID | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id ?? ''),
    queryFn: () => customersApi.adminGetCustomer(id as UUID),
    enabled: Boolean(id) && (opts?.enabled ?? true),
  });
}

// -------------------------------------------------------------- mutations ----

export function useSetCustomerActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: UUID; isActive: boolean }) =>
      customersApi.adminSetCustomerActive(id, isActive),
    onSuccess: (_customer, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.customers.all() });
      qc.invalidateQueries({ queryKey: queryKeys.customers.detail(id) });
    },
  });
}
