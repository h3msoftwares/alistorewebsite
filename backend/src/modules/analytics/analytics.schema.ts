import { z } from 'zod';

/**
 * Shared query params for every `/api/admin/analytics/*` endpoint.
 *
 * `from` / `to` bound the reporting window (default: the last 30 days,
 * inclusive of now). `granularity` controls the time-series bucket. All
 * aggregation is query-time — fine for a single-store dataset.
 */
export const analyticsRangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  // Only used by /inventory — a variant at or below this many units is "low".
  lowStockThreshold: z.coerce.number().int().min(1).max(1000).default(5),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;
