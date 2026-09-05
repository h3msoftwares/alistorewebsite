'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from './palette';

export interface TrendSeries {
  key: string;
  label: string;
}

/**
 * One or two stacked area series over a time bucket. `data` rows have an
 * `x` label plus a numeric value per series key.
 */
export function TrendLine({
  data,
  series,
  formatY,
}: {
  data: Record<string, string | number>[];
  series: TrendSeries[];
  formatY?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--color-border-strong)" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="var(--color-border-strong)"
          width={48}
          tickFormatter={formatY}
        />
        <Tooltip />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
