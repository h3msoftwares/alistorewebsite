'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from './palette';

export interface BreakdownDatum {
  label: string;
  value: number;
}

/** Horizontal bars for a "top N by …" breakdown. */
export function BreakdownBars({
  data,
  formatValue,
}: {
  data: BreakdownDatum[];
  formatValue?: (v: number) => string;
}) {
  if (data.length === 0) return <p className="chart-card__empty">No data in this range.</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-border-strong)" tickFormatter={formatValue} />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11 }}
          stroke="var(--color-border-strong)"
          width={110}
        />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
