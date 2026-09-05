'use client';

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import { presetToParams, type AnalyticsPreset } from '@/lib/api/analytics';
import { queryKeys } from '@/lib/query-keys';

const STALE = 5 * 60 * 1000;

function useReport<T>(name: string, preset: AnalyticsPreset, fn: (p: ReturnType<typeof presetToParams>) => Promise<T>) {
  return useQuery({
    queryKey: queryKeys.analytics.report(name, preset),
    queryFn: () => fn(presetToParams(preset)),
    staleTime: STALE,
  });
}

export const useAnalyticsOverview = (preset: AnalyticsPreset) =>
  useReport('overview', preset, analyticsApi.getOverview);
export const useAnalyticsSales = (preset: AnalyticsPreset) =>
  useReport('sales', preset, analyticsApi.getSales);
export const useAnalyticsCustomers = (preset: AnalyticsPreset) =>
  useReport('customers', preset, analyticsApi.getCustomers);
export const useAnalyticsInventory = (preset: AnalyticsPreset) =>
  useReport('inventory', preset, analyticsApi.getInventory);
export const useAnalyticsProducts = (preset: AnalyticsPreset) =>
  useReport('products', preset, analyticsApi.getProducts);
export const useAnalyticsVisitors = (preset: AnalyticsPreset) =>
  useReport('visitors', preset, analyticsApi.getVisitors);
