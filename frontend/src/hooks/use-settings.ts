'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { SiteSettingsBody } from '@/lib/types';

/** Owner-editable storefront chrome (brand name, announcement strip, hero
 *  copy, footer links). Read on every page by the chrome components, so a
 *  long staleTime keeps it from refetching constantly. */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.root(),
    queryFn: settingsApi.getSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SiteSettingsBody) => settingsApi.updateSettings(body),
    onSuccess: (settings) => {
      qc.setQueryData(queryKeys.settings.root(), settings);
      qc.invalidateQueries({ queryKey: queryKeys.settings.root() });
    },
  });
}
