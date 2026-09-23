import { round2 } from './money';
import { coversTarget, type TargetCandidate } from './pricing';

// Cart-level "buy N, pay $X total" combo/tiered pricing — deliberately its
// own pass, separate from lib/pricing.ts's per-line pickPromotion/
// pricedWithPromotion. Those price ONE product in isolation and are called
// from places (product listing, product detail, favourites) that never have
// a cart to look at; a combo needs to see every eligible unit across every
// cart line at once, so it runs as one extra step AFTER per-line pricing
// (product sale + best Promotion, via lineUnitPrice) and BEFORE the
// resulting subtotal is used for the coupon/delivery-fee/expectedSubtotal
// steps that already exist in cart.service.ts/order.service.ts. See the
// design plan (Q1) for the full pipeline-placement rationale.

export interface ComboTierCandidate {
  /** Group size lower bound (inclusive). */
  minQty: number;
  /** Group size upper bound (inclusive); null = open-ended. */
  maxQty: number | null;
  /** FLAT total price for a group whose size falls in [minQty, maxQty] —
   *  not a per-unit price. */
  price: number;
}

/** Everything pickComboRule needs to test whether a ComboRule covers a given
 *  product, plus its price schedule. Shares TargetCandidate's targeting
 *  shape with PromotionCandidate (lib/pricing.ts) on purpose — see
 *  matchTarget/coversTarget there. */
export interface ComboRuleCandidate extends TargetCandidate {
  id: string;
  nameEn: string;
  nameAr: string;
  priority: number;
  tiers: ComboTierCandidate[];
}

/**
 * Attributes a product to at most one ComboRule — same single-winner-by-
 * `priority` rule as pickPromotion, so a product is never pooled into two
 * different rules' groupings at once. Unlike pickPromotion, ties aren't
 * broken by "whichever gives the lower price": that would require pricing
 * the whole cart's grouping per candidate rule, not just one product. Ties
 * fall back to the first match — the same "good enough, rare overlap"
 * tolerance activePromotions() already accepts for
 * ruleBasedProductCollections. Admins should keep priorities distinct across
 * overlapping combo rules if this matters.
 */
export function pickComboRule(
  product: { id: string; categoryPaths: string[]; collectionIds: string[] },
  comboRules: ComboRuleCandidate[]
): ComboRuleCandidate | null {
  const matches = comboRules.filter((r) => coversTarget(r, product));
  if (matches.length === 0) return null;
  const topPriority = Math.max(...matches.map((r) => r.priority));
  return matches.find((r) => r.priority === topPriority)!;
}

/** One cart/order line's pricing inputs, decoupled from Prisma — same
 *  convention as line-pricing.ts's LineVariant. */
export interface ComboPricingLine {
  /** Stable id for this line (CartItem.id, or the line's index at checkout)
   *  — used only to attribute the result back to the right line. */
  lineId: string;
  productId: string;
  categoryPaths: string[];
  collectionIds: string[];
  quantity: number;
  /** This line's per-unit price BEFORE combo pricing — lineUnitPrice()'s
   *  result (variant override -> product sale -> best active Promotion). */
  individualUnitPrice: number;
}

export interface ComboPricingResult {
  /** lineId -> the combo-adjusted total for that line's FULL quantity. Equal
   *  to `round2(individualUnitPrice * quantity)` for a line no combo rule
   *  touched. Callers needing a per-unit price (e.g. OrderItem.unitPrice)
   *  divide this by the line's quantity — see the design plan (Q4). */
  lineTotals: Map<string, number>;
  /** lineId -> the ComboRule id attributed to that line, or null. */
  lineComboRuleIds: Map<string, string | null>;
  subtotal: number;
  /** individual-pricing subtotal minus the combo-adjusted subtotal — always
   *  >= 0 by construction (see priceRuleGroup: k=0, "group nothing," is
   *  always one of the candidates minimized over), never a display-only
   *  number computed separately from what was actually charged. */
  comboSavings: number;
}

// Defensive ceiling on how many pooled eligible units a single ComboRule's
// DP will ever consider grouping, in one cart, in one call. A single
// CartItem line is already capped at 999 (cart.schema.ts), and a real
// shopper's combo-eligible pool is expected to be in the tens — this only
// ever engages on a pathological/abusive cart. Units beyond the cap are
// always priced individually (a safe, valid outcome — "best price wins"
// degrades to "no combo for the excess," never to a worse price). See the
// design plan (Q2) for the complexity analysis this bound is based on.
export const MAX_COMBO_DP_UNITS = 300;

interface Unit {
  lineId: string;
  price: number;
}

interface DpChoice {
  g: number;
  price: number;
}

/**
 * dp[k] = the minimum FLAT-price cost to cover exactly k units using only
 * tier-sized groups (no individual fallback inside this function — the
 * individual fallback for whatever isn't grouped is handled by the caller,
 * which is what makes "group nothing" always a safe, comparable option).
 * choice[k] records the last group size/price used to reach dp[k], so the
 * caller can walk the trail backward and reconstruct the actual groups.
 *
 * O(k * tiers * groupSizeRange) — see the design plan (Q2) for why only the
 * exact DP (not a greedy heuristic) guarantees the true minimum across an
 * arbitrary admin-defined tier schedule.
 */
function computeGroupedCost(
  n: number,
  tiers: ComboTierCandidate[]
): { cost: number[]; choice: (DpChoice | null)[] } {
  const cost = new Array(n + 1).fill(Infinity);
  const choice: (DpChoice | null)[] = new Array(n + 1).fill(null);
  cost[0] = 0;
  for (let k = 1; k <= n; k++) {
    for (const t of tiers) {
      const upper = Math.min(t.maxQty ?? k, k);
      for (let g = t.minQty; g <= upper; g++) {
        const candidate = cost[k - g] + t.price;
        if (candidate < cost[k]) {
          cost[k] = candidate;
          choice[k] = { g, price: t.price };
        }
      }
    }
  }
  return { cost, choice };
}

/** Splits one flat group price across its member units proportionally to
 *  each unit's own individual price (a $10-vs-$4 pair sharing a $12 group
 *  price splits ~8.57/3.43, not 6/6 — see the design plan's allocation
 *  note), then reconciles cent-level rounding with a largest-remainder pass
 *  so the members' shares sum EXACTLY to `groupPrice`. */
function allocateGroup(members: Unit[], groupPrice: number): number[] {
  const sum = members.reduce((s, m) => s + m.price, 0);
  const targetCents = Math.round(groupPrice * 100);
  if (sum <= 0) {
    // Degenerate (a real priced product is never <= 0) — split evenly
    // rather than divide by zero.
    const base = Math.floor(targetCents / members.length);
    const cents = members.map(() => base);
    let remainder = targetCents - base * members.length;
    for (let i = 0; i < cents.length && remainder > 0; i++, remainder--) cents[i] += 1;
    return cents.map((c) => c / 100);
  }
  const raw = members.map((m) => (m.price / sum) * groupPrice * 100);
  const cents = raw.map((r) => Math.floor(r));
  let remainder = targetCents - cents.reduce((s, c) => s + c, 0);
  const byFractionDesc = raw
    .map((r, i) => ({ i, frac: r - cents[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let idx = 0; idx < byFractionDesc.length && remainder > 0; idx++, remainder--) {
    cents[byFractionDesc[idx].i] += 1;
  }
  return cents.map((c) => c / 100);
}

/** Prices every unit pooled under ONE ComboRule (already attributed by
 *  pickComboRule — see applyComboPricing). Returns lineId -> that rule's
 *  contribution to that line's total. */
function priceRuleGroup(lines: ComboPricingLine[], tiers: ComboTierCandidate[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.lineId, 0);

  const units: Unit[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i++) units.push({ lineId: line.lineId, price: line.individualUnitPrice });
  }
  // Most expensive first: for a fixed number of grouped units, hiding the
  // priciest ones inside a flat-price group and leaving the cheapest priced
  // individually is always at least as good, never worse (exchange
  // argument — see the design plan's Q2).
  units.sort((a, b) => b.price - a.price);

  const add = (lineId: string, amount: number) => totals.set(lineId, totals.get(lineId)! + amount);

  const n = units.length;
  const dpN = Math.min(n, MAX_COMBO_DP_UNITS);
  for (let i = dpN; i < n; i++) add(units[i].lineId, units[i].price); // beyond the cap: always individual

  const { cost, choice } = computeGroupedCost(dpN, tiers);
  const prefix = new Array(dpN + 1).fill(0);
  for (let i = 0; i < dpN; i++) prefix[i + 1] = prefix[i] + units[i].price;
  const poolTotal = prefix[dpN];

  // "Best price wins" is built in here, not a separate comparison: k=0
  // (group nothing) always starts as the candidate, so the chosen total can
  // never exceed pure individual pricing for this pool.
  let bestK = 0;
  let bestTotal = poolTotal;
  for (let k = 1; k <= dpN; k++) {
    if (!Number.isFinite(cost[k])) continue;
    const total = cost[k] + (poolTotal - prefix[k]);
    if (total < bestTotal) {
      bestTotal = total;
      bestK = k;
    }
  }

  // Positions [bestK, dpN) — the cheapest units in the DP pool — stay individual.
  for (let i = bestK; i < dpN; i++) add(units[i].lineId, units[i].price);

  // Positions [0, bestK) — the most expensive units — are grouped, per the
  // group sizes/prices reconstructed by walking the DP's choice trail
  // backward from bestK to 0.
  const groups: DpChoice[] = [];
  for (let k = bestK; k > 0; ) {
    const c = choice[k]!;
    groups.push(c);
    k -= c.g;
  }
  let cursor = 0;
  for (const group of groups) {
    const members = units.slice(cursor, cursor + group.g);
    cursor += group.g;
    const shares = allocateGroup(members, group.price);
    members.forEach((m, i) => add(m.lineId, shares[i]));
  }

  for (const [lineId, total] of totals) totals.set(lineId, round2(total));
  return totals;
}

/**
 * The cart-level pass: attributes every line to at most one ComboRule
 * (pickComboRule), groups each rule's pooled eligible units to find the
 * minimum-cost split between tier-priced groups and individually-priced
 * leftovers (priceRuleGroup), and rolls the result up into a combo-adjusted
 * subtotal. A line untouched by any active/eligible ComboRule is priced
 * exactly as it is today (`individualUnitPrice * quantity`) — a cart with no
 * active combo rules produces byte-identical output to calling
 * lineUnitPrice() directly and summing, which is the regression guarantee
 * this function is designed never to break.
 */
export function applyComboPricing(lines: ComboPricingLine[], comboRules: ComboRuleCandidate[]): ComboPricingResult {
  const lineTotals = new Map<string, number>();
  const lineComboRuleIds = new Map<string, string | null>();
  const buckets = new Map<string, { rule: ComboRuleCandidate; lines: ComboPricingLine[] }>();

  for (const line of lines) {
    const picked = comboRules.length
      ? pickComboRule({ id: line.productId, categoryPaths: line.categoryPaths, collectionIds: line.collectionIds }, comboRules)
      : null;
    lineComboRuleIds.set(line.lineId, picked?.id ?? null);
    if (!picked) {
      lineTotals.set(line.lineId, round2(line.individualUnitPrice * line.quantity));
      continue;
    }
    let bucket = buckets.get(picked.id);
    if (!bucket) {
      bucket = { rule: picked, lines: [] };
      buckets.set(picked.id, bucket);
    }
    bucket.lines.push(line);
  }

  for (const { rule, lines: ruleLines } of buckets.values()) {
    const perLine = priceRuleGroup(ruleLines, rule.tiers);
    for (const [lineId, total] of perLine) lineTotals.set(lineId, total);
  }

  let subtotal = 0;
  let individualSubtotal = 0;
  for (const line of lines) {
    subtotal += lineTotals.get(line.lineId)!;
    individualSubtotal += round2(line.individualUnitPrice * line.quantity);
  }
  subtotal = round2(subtotal);

  return {
    lineTotals,
    lineComboRuleIds,
    subtotal,
    comboSavings: round2(Math.max(0, round2(individualSubtotal) - subtotal)),
  };
}
