// Static stand-in for `useCategories(collection.id)`. Structure only — swap
// for the real hook when the home page is wired up.
export interface PlaceholderCategory {
  slug: string;
  nameEn: string;
  nameAr: string;
}

export const PLACEHOLDER_CATEGORIES: Record<string, PlaceholderCategory[]> = {
  women: [
    { slug: 'lingerie', nameEn: 'Lingerie', nameAr: 'ملابس داخلية' },
    { slug: 'nightwear', nameEn: 'Nightwear', nameAr: 'ملابس النوم' },
    { slug: 'loungewear', nameEn: 'Loungewear', nameAr: 'ملابس مريحة' },
    { slug: 'accessories', nameEn: 'Accessories', nameAr: 'إكسسوارات' },
  ],
  men: [
    { slug: 'shirts', nameEn: 'Shirts', nameAr: 'قمصان' },
    { slug: 'underwear', nameEn: 'Underwear', nameAr: 'ملابس داخلية' },
    { slug: 'basics', nameEn: 'Basics', nameAr: 'أساسيات' },
    { slug: 'socks', nameEn: 'Socks', nameAr: 'جوارب' },
  ],
  kids: [
    { slug: 'pajamas', nameEn: 'Pajamas', nameAr: 'بيجامات' },
    { slug: 'everyday', nameEn: 'Everyday', nameAr: 'ملابس يومية' },
    { slug: 'newborn', nameEn: 'Newborn', nameAr: 'حديثي الولادة' },
    { slug: 'outerwear', nameEn: 'Outerwear', nameAr: 'ملابس خارجية' },
  ],
};
