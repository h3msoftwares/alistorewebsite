const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const money = (n: number | null | undefined) => usd0.format(n || 0);
export const money2 = (n: number | null | undefined) => usd2.format(n || 0);
export const num = (n: number | null | undefined) => (n || 0).toLocaleString('en-US');
export const pct = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(1)}%`;

/** Compact axis / tick label for an ISO bucket timestamp. */
export const bucketLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
