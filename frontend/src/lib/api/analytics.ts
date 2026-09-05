import { api } from './client';
import type {
  AnalyticsCustomers,
  AnalyticsInventory,
  AnalyticsOverview,
  AnalyticsProducts,
  AnalyticsRangeParams,
  AnalyticsSales,
  AnalyticsVisitors,
} from '../types';

/** Date-range presets offered by the analytics sub-layout. */
export type AnalyticsPreset = '7d' | '30d' | '90d' | '12mo';

export const PRESETS: { value: AnalyticsPreset; days: number; granularity: 'day' | 'week' | 'month' }[] = [
  { value: '7d', days: 7, granularity: 'day' },
  { value: '30d', days: 30, granularity: 'day' },
  { value: '90d', days: 90, granularity: 'week' },
  { value: '12mo', days: 365, granularity: 'month' },
];

export function presetToParams(preset: AnalyticsPreset): Required<AnalyticsRangeParams> {
  const cfg = PRESETS.find((p) => p.value === preset) ?? PRESETS[1];
  const to = new Date();
  const from = new Date(to.getTime() - cfg.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString(), granularity: cfg.granularity };
}

const get = <T>(path: string, params: AnalyticsRangeParams) =>
  api.get<T>(`/api/admin/analytics/${path}`, { query: params as Record<string, string> });

export const getOverview = (p: AnalyticsRangeParams) => get<AnalyticsOverview>('overview', p);
export const getSales = (p: AnalyticsRangeParams) => get<AnalyticsSales>('sales', p);
export const getCustomers = (p: AnalyticsRangeParams) => get<AnalyticsCustomers>('customers', p);
export const getInventory = (p: AnalyticsRangeParams) => get<AnalyticsInventory>('inventory', p);
export const getProducts = (p: AnalyticsRangeParams) => get<AnalyticsProducts>('products', p);
export const getVisitors = (p: AnalyticsRangeParams) => get<AnalyticsVisitors>('visitors', p);
