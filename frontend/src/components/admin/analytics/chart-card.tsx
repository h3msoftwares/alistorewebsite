import type { ReactNode } from 'react';

/**
 * Framed container for one chart or table on a dashboard. `height` sizes the
 * body so a Recharts `<ResponsiveContainer width="100%" height="100%">` inside
 * has something to fill.
 */
export function ChartCard({
  title,
  subtitle,
  height = 260,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  height?: number | 'auto';
  children: ReactNode;
}) {
  return (
    <section className="chart-card">
      <header className="chart-card__head">
        <h3 className="chart-card__title">{title}</h3>
        {subtitle != null && <p className="chart-card__subtitle">{subtitle}</p>}
      </header>
      <div
        className="chart-card__body"
        style={height === 'auto' ? undefined : { height }}
      >
        {children}
      </div>
    </section>
  );
}
