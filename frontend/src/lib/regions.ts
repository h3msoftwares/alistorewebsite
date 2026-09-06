/**
 * Lebanese governorates — the delivery-region taxonomy shared by the checkout
 * form, the admin delivery-fee table, and saved addresses. Mirrors
 * `backend/src/lib/regions.ts` — keep the two lists in sync.
 */
export const DELIVERY_REGIONS = [
  { value: 'BEIRUT', en: 'Beirut', ar: 'بيروت' },
  { value: 'MOUNT_LEBANON', en: 'Mount Lebanon', ar: 'جبل لبنان' },
  { value: 'NORTH', en: 'North', ar: 'الشمال' },
  { value: 'AKKAR', en: 'Akkar', ar: 'عكار' },
  { value: 'BEQAA', en: 'Beqaa', ar: 'البقاع' },
  { value: 'BAALBEK_HERMEL', en: 'Baalbek-Hermel', ar: 'بعلبك-الهرمل' },
  { value: 'SOUTH', en: 'South', ar: 'الجنوب' },
  { value: 'NABATIEH', en: 'Nabatieh', ar: 'النبطية' },
] as const;

export type DeliveryRegion = (typeof DELIVERY_REGIONS)[number]['value'];

export const REGION_VALUES = DELIVERY_REGIONS.map((r) => r.value) as DeliveryRegion[];

export function regionLabel(value: string | null | undefined, locale: 'en' | 'ar'): string {
  const r = DELIVERY_REGIONS.find((x) => x.value === value);
  return r ? r[locale] : (value ?? '');
}
