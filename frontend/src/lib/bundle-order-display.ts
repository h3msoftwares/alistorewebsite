import type { Order } from './types';

/** Read-only display figures derived from immutable v3 purchase snapshots.
 * OrderItem.lineTotal and unitPrice remain the actual paid allocations used
 * for returns, collection evidence, analytics and customer accounting. */
export function bundleOrderDisplay(order: Pick<Order, 'items' | 'subtotal'>) {
  if (!order.items.some((item) => item.priceBreakdown?.version === 3)) return null;
  const lines = new Map<string, { total: number; unitPrice: number | null }>();
  let paidCents = 0;
  let displayCents = 0;
  for (const item of order.items) {
    const netCents = Math.round(Number(item.lineTotal) * 100);
    const unitCents = item.priceBreakdown?.version === 3 ? item.priceBreakdown.individualUnitPriceCents : null;
    if (!Number.isSafeInteger(netCents) || netCents < 0 || (item.priceBreakdown?.version === 3
      && (unitCents == null || !Number.isSafeInteger(unitCents) || unitCents < 0))) return null;
    const grossCents = unitCents == null ? netCents : unitCents * item.quantity;
    if (!Number.isSafeInteger(grossCents) || grossCents < netCents) return null;
    lines.set(item.id, { total: grossCents / 100, unitPrice: unitCents == null ? null : unitCents / 100 });
    paidCents += netCents;
    displayCents += grossCents;
  }
  if (paidCents !== Math.round(Number(order.subtotal) * 100) || displayCents <= paidCents) return null;
  return { lines, subtotal: displayCents / 100, discount: (displayCents - paidCents) / 100 };
}
