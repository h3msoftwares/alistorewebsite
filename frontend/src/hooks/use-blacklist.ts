'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { blacklistApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { BlacklistEntryBody, UUID } from '@/lib/types';

export function useBlacklist() {
  return useQuery({ queryKey: queryKeys.blacklist.list(), queryFn: blacklistApi.listBlacklist });
}

export function useCreateBlacklistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BlacklistEntryBody) => blacklistApi.createBlacklistEntry(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.blacklist.all() }),
  });
}

export function useDeleteBlacklistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => blacklistApi.deleteBlacklistEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.blacklist.all() }),
  });
}
