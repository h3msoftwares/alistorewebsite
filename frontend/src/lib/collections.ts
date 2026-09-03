// The storefront's three primary "doors". These are seeded `Collection` rows
// on the backend (slug-matched); the slug is also the key for the compound
// visual accent in globals.css (`data-collection="women|men|kids"`).
//
// The catalog is collection-driven end to end now (owner can add more
// collections), but the persistent top nav + landing doors stay fixed to
// these three per the design brief. A page resolves its `Collection.id` from
// the slug via `GET /api/collections` before hitting `GET /api/products`.

export const STOREFRONT_COLLECTIONS = [
  { slug: 'women', nameEn: 'Women', nameAr: 'حريمي' },
  { slug: 'men', nameEn: 'Men', nameAr: 'رجالي' },
  { slug: 'kids', nameEn: 'Kids', nameAr: 'أطفال' },
] as const;

export type StorefrontCollectionSlug = (typeof STOREFRONT_COLLECTIONS)[number]['slug'];

export function isStorefrontCollectionSlug(value: string): value is StorefrontCollectionSlug {
  return STOREFRONT_COLLECTIONS.some((c) => c.slug === value);
}
