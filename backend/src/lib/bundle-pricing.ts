import { allocateCents } from './allocate-cents';
import { applyComboPricing, type ComboPricingLine, type ComboPricingResult, type ComboRuleCandidate } from './combo-pricing';
import { round2 } from './money';

export interface BundleCandidate {
  id: string;
  nameEn: string;
  nameAr: string;
  priceCents: number;
  components: { variantID: string; quantity: number }[];
}
export interface BundlePricingLine extends ComboPricingLine { variantID: string }
export interface AppliedBundle extends BundleCandidate {
  instanceCount: number;
  components: { variantID: string; quantity: number; lineId: string; individualPriceCents: number; unitIndices: number[] }[];
}
export type BundleUnit = { kind: 'BUNDLE'; bundleID: string; instance: number } | { kind: 'SURPLUS'; bundleID: string };
export interface BundlePricingResult extends ComboPricingResult {
  appliedBundles: AppliedBundle[];
  bundleUnits: Map<string, BundleUnit[]>;
  ordinarySubtotal: number;
  ordinaryLineUnitPricesCents: Map<string, number[]>;
  bundleSavings: number;
}

/** Adding the missing unit must increase the total, while completing the
 * recipe must save money. These bounds also keep partial-return repricing
 * monotonic. All comparisons use integer cents. */
export function bundlePriceBounds(components: { quantity: number; individualPriceCents: number }[]) {
  const fullCents = components.reduce((sum, c) => sum + c.quantity * c.individualPriceCents, 0);
  const incompleteCents = fullCents - Math.min(...components.map((c) => c.individualPriceCents));
  return { fullCents, incompleteCents };
}

/** Shared by cart, checkout preview and checkout. Recipes are disjoint by
 * variant (enforced transactionally when saved). Compare entire component
 * groups, not prorated units: volume pricing competes with the bundle plan,
 * and never stacks onto either bundled units or that plan's surplus. */
export function priceMerchandise(lines: BundlePricingLine[], volumeRules: ComboRuleCandidate[], bundles: BundleCandidate[], allowBundles = true): BundlePricingResult {
  const ordinary = applyComboPricing(lines, volumeRules);
  const result: BundlePricingResult = { ...ordinary, appliedBundles: [], bundleUnits: new Map(), ordinarySubtotal: ordinary.subtotal,
    ordinaryLineUnitPricesCents: new Map(ordinary.lineUnitPricesCents), bundleSavings: 0 };
  if (!allowBundles) return result;
  const byVariant = new Map(lines.map((line) => [line.variantID, line]));
  const claimed = new Set<string>();
  for (const bundle of [...bundles].sort((a, b) => a.id.localeCompare(b.id))) {
    const parts = bundle.components.map((c) => ({ ...c, line: byVariant.get(c.variantID) }));
    if (parts.length < 2 || parts.some((c) => !c.line || claimed.has(c.variantID))) continue;
    const components = parts.map((c) => ({ ...c, line: c.line!, individualPriceCents: Math.round(round2(c.line!.individualUnitPrice) * 100) }));
    const count = Math.min(...components.map((c) => Math.floor(c.line.quantity / c.quantity)));
    if (!count) continue;
    const bounds = bundlePriceBounds(components);
    // Prices/sales can change after activation; unsafe or ineffective recipes
    // must fall back to ordinary pricing, without changing historical orders.
    if (bundle.priceCents <= bounds.incompleteCents || bundle.priceCents >= bounds.fullCents) continue;
    const ordinaryCents = components.reduce((sum, c) => sum + Math.round(ordinary.lineTotals.get(c.line.lineId)! * 100), 0);
    const bundleCents = count * bundle.priceCents + components.reduce((sum, c) => sum + (c.line.quantity - count * c.quantity) * c.individualPriceCents, 0);
    if (bundleCents >= ordinaryCents) continue; // ties deliberately use ordinary pricing
    const ordered = [...components].sort((a, b) => a.variantID.localeCompare(b.variantID));
    const weights = ordered.flatMap((c) => Array<number>(c.quantity).fill(c.individualPriceCents));
    const allocations = allocateCents(bundle.priceCents, weights);
    let offset = 0;
    for (const c of ordered) {
      const perInstance = allocations.slice(offset, offset + c.quantity);
      offset += c.quantity;
      const units = Array.from({ length: count }, () => perInstance).flat();
      const identities: BundleUnit[] = Array.from({ length: count }, (_, instance) =>
        Array.from({ length: c.quantity }, (): BundleUnit => ({ kind: 'BUNDLE', bundleID: bundle.id, instance }))).flat();
      const surplus = c.line.quantity - count * c.quantity;
      units.push(...Array<number>(surplus).fill(c.individualPriceCents));
      identities.push(...Array.from({ length: surplus }, (): BundleUnit => ({ kind: 'SURPLUS', bundleID: bundle.id })));
      result.lineUnitPricesCents.set(c.line.lineId, units);
      result.bundleUnits.set(c.line.lineId, identities);
      result.lineTotals.set(c.line.lineId, units.reduce((sum, cents) => sum + cents, 0) / 100);
      result.lineComboRuleIds.set(c.line.lineId, null);
      claimed.add(c.variantID);
    }
    result.appliedBundles.push({ ...bundle, instanceCount: count, components: ordered.map((c) => ({
      variantID: c.variantID, quantity: c.quantity, lineId: c.line.lineId, individualPriceCents: c.individualPriceCents,
      unitIndices: Array.from({ length: count * c.quantity }, (_, index) => index),
    })) });
    result.bundleSavings += (ordinaryCents - bundleCents) / 100;
  }
  const totalCents = [...result.lineUnitPricesCents.values()].reduce((sum, units) => sum + units.reduce((n, cents) => n + cents, 0), 0);
  result.subtotal = totalCents / 100;
  result.bundleSavings = round2(result.bundleSavings);
  // Existing cart clients use comboSavings for the combined sale-vs-rule
  // savings. Keep that value reconciled with the selected merchandise plan.
  result.comboSavings = round2(lines.reduce((sum, line) => sum + line.quantity * round2(line.individualUnitPrice), 0) - result.subtotal);
  return result;
}
