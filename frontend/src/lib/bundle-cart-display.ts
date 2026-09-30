import type { CartView } from './types';

/** Display-only figures; the cart subtotal and line allocations remain the
 * authoritative prices used by checkout and returns. */
export function bundleCartDisplay(cart: Pick<CartView, 'items' | 'subtotal'>) {
  if (!cart.items.some((item) => item.bundleID)) return null;
  const lines = new Map<string, { total: number; unitPrice: number | null }>();
  let paidCents = 0;
  let displayCents = 0;
  for (const item of cart.items) {
    const netCents = Math.round((item.lineTotal ?? NaN) * 100);
    const unitCents = item.bundleID ? item.individualUnitPriceCents : null;
    if (!Number.isSafeInteger(netCents) || netCents < 0 || (item.bundleID
      && (unitCents == null || !Number.isSafeInteger(unitCents) || unitCents < 0))) return null;
    const grossCents = unitCents == null ? netCents : unitCents * item.quantity;
    if (!Number.isSafeInteger(grossCents) || grossCents < netCents) return null;
    lines.set(item.id, { total: grossCents / 100, unitPrice: unitCents == null ? null : unitCents / 100 });
    paidCents += netCents;
    displayCents += grossCents;
  }
  if (paidCents !== Math.round(cart.subtotal * 100) || displayCents <= paidCents) return null;
  return { lines, subtotal: displayCents / 100, discount: (displayCents - paidCents) / 100 };
}
