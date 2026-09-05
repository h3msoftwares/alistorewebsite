import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { env } from '../../config/env';

/**
 * Read-only proxy to the Google Analytics 4 Data API.
 *
 * GA4 owns the traffic / visitor / source / device / top-of-funnel data (its
 * gtag.js `_ga` cookie handles identity); this module fetches aggregated
 * reports for the admin dashboards. Every result is cached in-process for 60s
 * to stay well inside the free 25k-requests/day quota.
 *
 * When the service-account env vars are unset every function returns
 * `{ configured: false }` and the dashboards render a "connect GA4" empty state
 * instead of a chart.
 */

export function ga4Configured(): boolean {
  return Boolean(env.GA4_PROPERTY_ID && env.GA4_SA_CLIENT_EMAIL && env.GA4_SA_PRIVATE_KEY);
}

let client: BetaAnalyticsDataClient | null = null;
function getClient(): BetaAnalyticsDataClient {
  if (!client) {
    client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: env.GA4_SA_CLIENT_EMAIL,
        // Env files store the key with literal "\n"; the API needs real newlines.
        private_key: env.GA4_SA_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
    });
  }
  return client;
}

interface Range {
  from: Date;
  to: Date;
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------------ cache ----

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// --------------------------------------------------------------- reporting --

type Row = Record<string, string | number>;

interface ReportOpts {
  range: Range;
  dimensions: string[];
  metrics: string[];
  orderByMetric?: string;
  limit?: number;
  dimensionInList?: { field: string; values: string[] };
}

async function runReport(opts: ReportOpts): Promise<Row[]> {
  const [res] = await getClient().runReport({
    property: `properties/${env.GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: isoDate(opts.range.from), endDate: isoDate(opts.range.to) }],
    dimensions: opts.dimensions.map((name) => ({ name })),
    metrics: opts.metrics.map((name) => ({ name })),
    limit: opts.limit,
    orderBys: opts.orderByMetric
      ? [{ desc: true, metric: { metricName: opts.orderByMetric } }]
      : undefined,
    dimensionFilter: opts.dimensionInList
      ? {
          filter: {
            fieldName: opts.dimensionInList.field,
            inListFilter: { values: opts.dimensionInList.values },
          },
        }
      : undefined,
  });

  return (res.rows ?? []).map((r) => {
    const row: Row = {};
    opts.dimensions.forEach((name, i) => {
      row[name] = r.dimensionValues?.[i]?.value ?? '';
    });
    opts.metrics.forEach((name, i) => {
      row[name] = Number(r.metricValues?.[i]?.value ?? 0);
    });
    return row;
  });
}

// --------------------------------------------------------------- endpoints --

export async function visitors(range: Range) {
  if (!ga4Configured()) return { configured: false as const };
  const key = `visitors:${isoDate(range.from)}:${isoDate(range.to)}`;
  return cached(key, async () => {
    const [traffic, sources, devices, geo, pages] = await Promise.all([
      runReport({
        range,
        dimensions: ['date'],
        metrics: [
          'activeUsers',
          'newUsers',
          'sessions',
          'screenPageViews',
          'bounceRate',
          'engagementRate',
          'averageSessionDuration',
        ],
      }),
      runReport({
        range,
        dimensions: ['sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium', 'sessionCampaignName'],
        metrics: ['sessions', 'activeUsers', 'conversions'],
        orderByMetric: 'sessions',
        limit: 25,
      }),
      runReport({
        range,
        dimensions: ['deviceCategory', 'browser', 'operatingSystem', 'language'],
        metrics: ['activeUsers'],
        orderByMetric: 'activeUsers',
        limit: 25,
      }),
      runReport({
        range,
        dimensions: ['country', 'city'],
        metrics: ['activeUsers'],
        orderByMetric: 'activeUsers',
        limit: 25,
      }),
      runReport({
        range,
        dimensions: ['pagePath'],
        metrics: ['screenPageViews', 'activeUsers'],
        orderByMetric: 'screenPageViews',
        limit: 25,
      }),
    ]);
    // GA4 has no clean "exit page" dimension — landing/top pages only.
    return { configured: true as const, traffic, sources, devices, geo, pages };
  });
}

const FUNNEL_EVENTS = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'] as const;

export async function funnel(range: Range) {
  if (!ga4Configured()) return { configured: false as const };
  const key = `funnel:${isoDate(range.from)}:${isoDate(range.to)}`;
  return cached(key, async () => {
    const rows = await runReport({
      range,
      dimensions: ['eventName'],
      metrics: ['eventCount'],
      dimensionInList: { field: 'eventName', values: [...FUNNEL_EVENTS] },
    });
    const count = (name: string) =>
      Number(rows.find((r) => r.eventName === name)?.eventCount ?? 0);
    const steps = FUNNEL_EVENTS.map((name) => ({ step: name, count: count(name) }));
    const withRates = steps.map((s, i) => ({
      ...s,
      conversionFromPrevious: i === 0 || steps[i - 1].count === 0 ? null : s.count / steps[i - 1].count,
      conversionFromTop: steps[0].count === 0 ? null : s.count / steps[0].count,
    }));
    return { configured: true as const, steps: withRates };
  });
}

export async function productViews(range: Range) {
  if (!ga4Configured()) return { configured: false as const, rows: [] as Row[] };
  const key = `productViews:${isoDate(range.from)}:${isoDate(range.to)}`;
  return cached(key, async () => {
    const rows = await runReport({
      range,
      dimensions: ['itemId', 'itemName'],
      metrics: ['itemsViewed', 'itemsAddedToCart', 'itemsPurchased', 'itemRevenue'],
      orderByMetric: 'itemsViewed',
      limit: 200,
    });
    return { configured: true as const, rows };
  });
}
