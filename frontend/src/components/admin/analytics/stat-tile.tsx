import type { ReactNode } from 'react';

/** A single KPI: a label, a formatted value, and an optional sub-line. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
      {hint != null && <span className="stat-tile__hint">{hint}</span>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="analytics-grid">{children}</div>;
}
