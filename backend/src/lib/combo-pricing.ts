import { round2 } from './money';
import type { TargetCandidate } from './pricing';
import type { PurchasePricingSnapshot } from './return-pricing';

/** Price is a per-unit rate. maxQty is derived, never an input to pricing. */
export interface ComboTierCandidate {
  minQty: number;
  maxQty?: number | null;
  price: number;
}
export interface ComboRuleCandidate extends TargetCandidate {
  id: string;
  nameEn: string;
  nameAr: string;
  priority: number;
  tiers: ComboTierCandidate[];
}

/** Targeting tables are retained for future bundles; volume rules only
 * cover one explicitly selected product, independently per variant line. */
export function pickComboRule(product: { id: string; categoryPaths: string[]; collectionIds: string[] }, rules: ComboRuleCandidate[]) {
  const matches = rules.filter((rule) => !rule.appliesToAll
    && rule.directProductIds.length === 1 && rule.directProductIds[0] === product.id
    && rule.categoryTargets.length === 0 && rule.collections.length === 0);
  return matches.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
}

export function deriveComboTiers(tiers: ComboTierCandidate[]) {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  return sorted.map((tier, index) => ({
    minQty: tier.minQty, price: tier.price, maxQty: sorted[index + 1] ? sorted[index + 1].minQty - 1 : null,
  }));
}

export function volumeUnitPriceCents(quantity: number, individualUnitPrice: number, tiers: ComboTierCandidate[]) {
  const band = [...tiers].sort((a, b) => b.minQty - a.minQty).find((tier) => quantity >= tier.minQty);
  const individual = Math.round(round2(individualUnitPrice) * 100);
  return band ? Math.min(individual, Math.round(round2(band.price) * 100)) : individual;
}

/** Inside a band the rate is constant; check strict total growth at every
 * boundary, including the transition from the individual price. */
export function volumeBandBoundaries(tiers: ComboTierCandidate[], individualUnitPrice: number) {
  return deriveComboTiers(tiers).filter((tier) => tier.minQty > 1).map((tier) => {
    const beforeQuantity = tier.minQty - 1;
    const beforeRateCents = volumeUnitPriceCents(beforeQuantity, individualUnitPrice, tiers);
    const afterRateCents = volumeUnitPriceCents(tier.minQty, individualUnitPrice, tiers);
    const beforeTotalCents = beforeQuantity * beforeRateCents;
    const afterTotalCents = tier.minQty * afterRateCents;
    return { beforeQuantity, afterQuantity: tier.minQty, beforeRateCents, afterRateCents,
      beforeTotalCents, afterTotalCents, valid: afterTotalCents > beforeTotalCents };
  });
}

export interface ComboPricingLine {
  lineId: string;
  productId: string;
  categoryPaths: string[];
  collectionIds: string[];
  quantity: number;
  individualUnitPrice: number;
}
export interface ComboPricingResult {
  linePricingBasis: Map<string, Pick<PurchasePricingSnapshot, 'pricingModel' | 'quantity' | 'individualUnitPriceCents' | 'tiers' | 'rule'>>;
  lineTotals: Map<string, number>;
  lineUnitPricesCents: Map<string, number[]>;
  lineComboRuleIds: Map<string, string | null>;
  subtotal: number;
  comboSavings: number;
}

/** Select a rate for the WHOLE line quantity, then compare with existing
 * sale/promotion pricing. No pooling, grouping, or quantity cutoff.
 * Coupons are allocated afterward by checkoutItemPrices. */
export function applyComboPricing(lines: ComboPricingLine[], rules: ComboRuleCandidate[]): ComboPricingResult {
  const lineTotals = new Map<string, number>();
  const lineUnitPricesCents = new Map<string, number[]>();
  const lineComboRuleIds = new Map<string, string | null>();
  const linePricingBasis: ComboPricingResult['linePricingBasis'] = new Map();
  let subtotalCents = 0;
  let individualSubtotalCents = 0;
  for (const line of lines) {
    const rule = pickComboRule({ id: line.productId, categoryPaths: line.categoryPaths, collectionIds: line.collectionIds }, rules);
    const unitCents = volumeUnitPriceCents(line.quantity, line.individualUnitPrice, rule?.tiers ?? []);
    const individualCents = Math.round(round2(line.individualUnitPrice) * 100);
    linePricingBasis.set(line.lineId, {
      pricingModel: 'UNIT_RATE_BANDS', quantity: line.quantity, individualUnitPriceCents: individualCents,
      tiers: deriveComboTiers(rule?.tiers ?? []).map((tier) => ({ minQty: tier.minQty, unitPriceCents: Math.round(round2(tier.price) * 100) })),
      rule: rule ? { id: rule.id, nameEn: rule.nameEn, nameAr: rule.nameAr, priority: rule.priority } : null,
    });
    lineTotals.set(line.lineId, unitCents * line.quantity / 100);
    lineUnitPricesCents.set(line.lineId, Array<number>(line.quantity).fill(unitCents));
    lineComboRuleIds.set(line.lineId, unitCents < individualCents ? rule?.id ?? null : null);
    subtotalCents += unitCents * line.quantity;
    individualSubtotalCents += individualCents * line.quantity;
  }
  return { lineTotals, lineUnitPricesCents, lineComboRuleIds, linePricingBasis,
    subtotal: subtotalCents / 100, comboSavings: (individualSubtotalCents - subtotalCents) / 100 };
}
