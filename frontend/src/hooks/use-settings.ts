'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import type { SiteSettingsBody } from '@/lib/types';

const SETTINGS_KEY = ['settings'] as const;

/** Owner-editable storefront chrome (brand name, announcement strip, hero
 *  copy, footer links). Read on every page by the chrome components, so a
 *  long staleTime keeps it from refetching constantly. */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: settingsApi.getSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SiteSettingsBody) => settingsApi.updateSettings(body),
    onSuccess: (settings) => {
      qc.setQueryData(SETTINGS_KEY, settings);
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
