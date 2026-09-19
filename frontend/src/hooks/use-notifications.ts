'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { UUID } from '@/lib/types';

// No SSE/WebSocket infra exists anywhere in this app — a 30s poll is
// consistent with every other TanStack Query usage here and keeps the bell
// reasonably fresh without adding new infrastructure for one feature.
const POLL_INTERVAL_MS = 30_000;

export function useNotifications(unreadOnly?: boolean) {
  return useQuery({
    queryKey: queryKeys.notifications.list(unreadOnly),
    queryFn: () => notificationsApi.listNotifications(unreadOnly),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => notificationsApi.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.all() }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.all() }),
  });
}
