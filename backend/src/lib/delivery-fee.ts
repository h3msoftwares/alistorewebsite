/**
 * Pure delivery-fee resolution. Given the admin's config (from `SiteSetting` +
 * its `DeliveryRate` rows) and an order's subtotal + destination governorate,
 * returns the fee and, when it's zero, why.
 *
 * Precedence: master switch off → free-delivery threshold reached → destination
 * on the free-governorate list → a per-governorate override rate → the flat
 * fallback fee. The threshold compares against the merchandise subtotal.
 */

export type FreeReason = 'disabled' | 'threshold' | 'region' | null;

export interface DeliveryConfig {
  deliveryFeeEnabled: boolean;
  deliveryFeeFlat: number;
  freeDeliveryThreshold: number | null;
  freeDeliveryRegions: string[];
  deliveryRates: { region: string; fee: number }[];
}

export interface DeliveryQuote {
  fee: number;
  freeReason: FreeReason;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function resolveDeliveryFee(
  cfg: DeliveryConfig,
  subtotal: number,
  region: string
): DeliveryQuote {
  if (!cfg.deliveryFeeEnabled) return { fee: 0, freeReason: 'disabled' };
  if (cfg.freeDeliveryThreshold != null && subtotal >= cfg.freeDeliveryThreshold) {
    return { fee: 0, freeReason: 'threshold' };
  }
  if (cfg.freeDeliveryRegions.includes(region)) return { fee: 0, freeReason: 'region' };

  const rate = cfg.deliveryRates.find((r) => r.region === region);
  const fee = cents(rate ? rate.fee : cfg.deliveryFeeFlat);
  return { fee, freeReason: null };
}

/** Narrows a `SiteSetting` row (Prisma `Decimal` fields) to the plain-number
 *  config the resolver wants. */
export function toDeliveryConfig(setting: {
  deliveryFeeEnabled: boolean;
  deliveryFeeFlat: unknown;
  freeDeliveryThreshold: unknown;
  freeDeliveryRegions: string[];
  deliveryRates: { region: string; fee: unknown }[];
}): DeliveryConfig {
  return {
    deliveryFeeEnabled: setting.deliveryFeeEnabled,
    deliveryFeeFlat: Number(setting.deliveryFeeFlat ?? 0),
    freeDeliveryThreshold:
      setting.freeDeliveryThreshold == null ? null : Number(setting.freeDeliveryThreshold),
    freeDeliveryRegions: setting.freeDeliveryRegions ?? [],
    deliveryRates: (setting.deliveryRates ?? []).map((r) => ({
      region: r.region,
      fee: Number(r.fee),
    })),
  };
}
