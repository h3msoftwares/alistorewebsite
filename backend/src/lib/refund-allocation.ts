/** Exact largest-remainder allocation. Ties use immutable line IDs, independent
 * of query order. BigInt products avoid drift at the schema's money limit. */
export function allocateRefundCents(amountCents: number, lines: { id: string; calculatedCents: number; quantity: number }[]) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || !lines.length) throw new Error('Invalid refund allocation');
  if (lines.some(line => !Number.isSafeInteger(line.calculatedCents) || line.calculatedCents < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1)) {
    throw new Error('Invalid refund allocation weights');
  }
  const useQuantity = lines.every(line => line.calculatedCents === 0);
  const weights = lines.map(line => BigInt(useQuantity ? line.quantity : line.calculatedCents));
  const total = weights.reduce((sum, weight) => sum + weight, 0n);
  const parts = lines.map((line, index) => {
    const product = BigInt(amountCents) * weights[index];
    return { id: line.id, cents: Number(product / total), remainder: product % total };
  });
  let remaining = amountCents - parts.reduce((sum, part) => sum + part.cents, 0);
  const ranked = [...parts].sort((a, b) => a.remainder === b.remainder
    ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.remainder > b.remainder ? -1 : 1);
  for (const part of ranked) { if (remaining === 0) break; part.cents++; remaining--; }
  return parts.map(({ id, cents }) => ({ id, cents }));
}
