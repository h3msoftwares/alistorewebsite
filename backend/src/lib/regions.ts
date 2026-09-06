/**
 * Lebanese governorates — the delivery-region taxonomy used by the
 * delivery-fee engine, checkout, and the admin fee table.
 *
 * Stored on `Order.deliveryRegion` / `Address.region` as the `value` string and
 * validated with `z.enum(REGION_VALUES)`. Kept as a plain list (not a Prisma
 * enum) so the bilingual labels live in one place and adding a region is not a
 * migration. `frontend/src/lib/regions.ts` mirrors this — keep the two in sync.
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
