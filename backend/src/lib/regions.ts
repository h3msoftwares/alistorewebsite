/**
 * Built-in Lebanese governorates — the default delivery regions offered at
 * checkout and pre-listed in the admin fee table. The admin can also add
 * custom zone names (stored the same way, as a free string on
 * `Order.deliveryRegion` / `Address.region` / `DeliveryRate.region`); those
 * live only in `SiteSetting`, not here. `frontend/src/lib/regions.ts` mirrors
 * this list — keep the two in sync.
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

export const REGION_VALUES = DELIVERY_REGIONS.map((r) => r.value) as [
  DeliveryRegion,
  ...DeliveryRegion[],
];

export function isDeliveryRegion(v: unknown): v is DeliveryRegion {
  return typeof v === 'string' && (REGION_VALUES as string[]).includes(v);
}
