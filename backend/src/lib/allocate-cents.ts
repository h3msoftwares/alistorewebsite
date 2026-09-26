/** Proportional integer allocation, with ties resolved by input order.
 * BigInt products keep remainder comparisons exact even for large prices. */
export function allocateCents(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0
    || weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new Error('Money allocations require nonnegative integer cents');
  }
  if (total === 0) return weights.map(() => 0);
  if (!weights.length) throw new Error('Cannot allocate money without units');
  const sum = weights.reduce((value, weight) => value + BigInt(weight), 0n);
  const denominator = sum || BigInt(weights.length);
  const numerators = weights.map((weight) => BigInt(total) * (sum ? BigInt(weight) : 1n));
  const amounts = numerators.map((value) => Number(value / denominator));
  const ranked = numerators.map((value, index) => ({ index, remainder: value % denominator }))
    .sort((a, b) => a.remainder === b.remainder
      ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const remainder = total - amounts.reduce((value, amount) => value + amount, 0);
  for (let i = 0; i < remainder; i++) amounts[ranked[i].index] += 1;
  return amounts;
}
