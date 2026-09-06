import { PrismaClient, type DiscountType } from '@prisma/client';
import argon2 from 'argon2';

// Load backend/.env the same way seed.ts does.
try {
  process.loadEnvFile();
} catch {
  // env provided externally
}

const prisma = new PrismaClient();

/** Same guard as seed.ts. */
function requireSeedAdminPassword(): string {
  const pw = process.env.SEED_ADMIN_PASSWORD;
  if (!pw || pw.length < 8) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to at least 8 characters before seeding. ' +
        'Add it to backend/.env (see backend/.env.example).'
    );
  }
  return pw;
}

/** Deterministic stand-in photo — a stable seed string always resolves to the
 *  same picsum image, so re-running doesn't reshuffle every product's gallery. */
function picsum(seed: string, w = 800, h = 1000): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

/** Tiny deterministic PRNG (mulberry32) so a given SKU always generates the
 *  same product — price, colours, stock — across runs. */
function rng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

// ---- Word banks (parallel EN / AR) for procedurally-named products ----
const ADJ = [
  ['Classic', 'كلاسيكي'],
  ['Linen', 'كتاني'],
  ['Cotton', 'قطني'],
  ['Slim-Fit', 'ضيق'],
  ['Oversized', 'واسع'],
  ['Ribbed', 'مضلع'],
  ['Pleated', 'بكسرات'],
  ['Everyday', 'يومي'],
  ['Tailored', 'مفصّل'],
  ['Relaxed', 'مريح'],
] as const;
const NOUN = [
  ['Shirt', 'قميص'],
  ['Dress', 'فستان'],
  ['Trousers', 'بنطلون'],
  ['Jacket', 'جاكيت'],
  ['Sweater', 'كنزة'],
  ['Skirt', 'تنورة'],
  ['T-Shirt', 'تي شيرت'],
  ['Hoodie', 'هودي'],
  ['Blouse', 'بلوزة'],
  ['Shorts', 'شورت'],
] as const;
const COLORS = [
  ['Black', 'أسود'],
  ['White', 'أبيض'],
  ['Navy', 'كحلي'],
  ['Beige', 'بيج'],
  ['Olive', 'زيتوني'],
  ['Burgundy', 'خمري'],
  ['Grey', 'رمادي'],
  ['Sky Blue', 'أزرق سماوي'],
  ['Rust', 'صدئي'],
  ['Sand', 'رملي'],
] as const;
const SIZES = ['S', 'M', 'L', 'XL'] as const;

const colorSlug = (c: string) => c.toLowerCase().replace(/\s+/g, '-');

// Products generated per category. Override for an even bigger (or smaller) set:
//   SEED_LARGE_PER_CATEGORY=100 npm run seed:large
const PER_CATEGORY = Math.max(1, Number(process.env.SEED_LARGE_PER_CATEGORY) || 50);
const IMAGES_PER_COLOR = 3;

const collectionDefs = [
  { slug: 'women', nameEn: 'Women', nameAr: 'نساء', sortOrder: 1, showInNav: true, showOnHome: true, showOnHomeAsImage: false, accentColor: '#a65a7e' },
  { slug: 'men', nameEn: 'Men', nameAr: 'رجال', sortOrder: 2, showInNav: true, showOnHome: true, showOnHomeAsImage: false, accentColor: '#38455c' },
  { slug: 'kids', nameEn: 'Kids', nameAr: 'أطفال', sortOrder: 3, showInNav: true, showOnHome: false, showOnHomeAsImage: true, accentColor: '#b4611e' },
];

// 5 categories per collection → 15 categories → 15 * PER_CATEGORY products.
const categoryDefs = [
  ['women', 'wmn-tops', 'Tops', 'بلايز', 1, true],
  ['women', 'wmn-dresses', 'Dresses', 'فساتين', 2, false],
  ['women', 'wmn-knitwear', 'Knitwear', 'تريكو', 3, false],
  ['women', 'wmn-bottoms', 'Bottoms', 'بناطيل وتنانير', 4, false],
  ['women', 'wmn-outerwear', 'Outerwear', 'ملابس خارجية', 5, false],
  ['men', 'men-shirts', 'Shirts', 'قمصان', 1, true],
  ['men', 'men-tees', 'T-Shirts', 'تيشيرتات', 2, false],
  ['men', 'men-knitwear', 'Knitwear', 'تريكو رجالي', 3, false],
  ['men', 'men-trousers', 'Trousers', 'بناطيل', 4, false],
  ['men', 'men-outerwear', 'Outerwear', 'ملابس خارجية', 5, false],
  ['kids', 'kid-tops', 'Tops', 'بلايز أطفال', 1, false],
  ['kids', 'kid-bottoms', 'Bottoms', 'بناطيل أطفال', 2, false],
  ['kids', 'kid-sets', 'Sets', 'أطقم أطفال', 3, true],
  ['kids', 'kid-outerwear', 'Outerwear', 'ملابس خارجية للأطفال', 4, false],
  ['kids', 'kid-sleep', 'Sleepwear', 'ملابس نوم', 5, false],
] as const;

async function main() {
  console.log(`[seed:large] starting… (${PER_CATEGORY} products/category)`);

  // ---- Admin account (the minimum, same as every seed) ----
  const adminPasswordHash = await argon2.hash(requireSeedAdminPassword());
  await prisma.user.upsert({
    where: { email: 'admin@alistore.com' },
    update: { emailVerified: new Date() },
    create: {
      email: 'admin@alistore.com',
      name: "Ali's Store Admin",
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
    },
  });

  // ---- Collections (+ one base image each) ----
  const collectionId = new Map<string, string>();
  for (const c of collectionDefs) {
    const { slug, ...rest } = c;
    const col = await prisma.collection.upsert({ where: { slug }, update: rest, create: c });
    collectionId.set(slug, col.id);
    await prisma.collectionImage.deleteMany({ where: { collectionID: col.id } });
    await prisma.collectionImage.create({
      data: { collectionID: col.id, url: picsum(`collection-${slug}`), altEn: c.nameEn, altAr: c.nameAr, sortOrder: 0 },
    });
  }

  // ---- Categories ----
  const categoryId = new Map<string, string>();
  for (const [colSlug, slug, nameEn, nameAr, sortOrder, showOnHome] of categoryDefs) {
    const data = { nameEn, nameAr, slug, collectionID: collectionId.get(colSlug)!, sortOrder, showOnHome };
    const cat = await prisma.category.upsert({ where: { slug }, update: data, create: data });
    categoryId.set(slug, cat.id);
  }

  // ---- Products — procedurally generated, every one with a full image set ----
  let productCount = 0;
  let imageCount = 0;

  for (const cd of categoryDefs) {
    const catSlug = cd[1];
    const catId = categoryId.get(catSlug)!;
    const colId = collectionId.get(catSlug.startsWith('wmn') ? 'women' : catSlug.startsWith('men') ? 'men' : 'kids')!;

    for (let i = 1; i <= PER_CATEGORY; i++) {
      const sku = `LG-${catSlug.toUpperCase()}-${String(i).padStart(3, '0')}`;
      const r = rng(sku);

      const [adjEn, adjAr] = pick(r, ADJ);
      const [nounEn, nounAr] = pick(r, NOUN);
      const nameEn = `${adjEn} ${nounEn} ${i}`;
      const nameAr = `${nounAr} ${adjAr} ${i}`;

      const price = 12 + Math.floor(r() * 88); // $12–$99
      const onSale = r() < 0.28;
      const saleType: DiscountType | null = onSale ? (r() < 0.6 ? 'PERCENT' : 'AMOUNT') : null;
      const saleValue = onSale ? (saleType === 'PERCENT' ? 10 + Math.floor(r() * 30) : 3 + Math.floor(r() * 12)) : null;
      const compareAtPrice = !onSale && r() < 0.35 ? price + 5 + Math.floor(r() * 20) : null;

      // 2–3 colours per product.
      const nColors = 2 + (r() < 0.5 ? 0 : 1);
      const colors: [string, string][] = [];
      while (colors.length < nColors) {
        const c = pick(r, COLORS);
        if (!colors.some((x) => x[0] === c[0])) colors.push([c[0], c[1]]);
      }

      const product = await prisma.product.upsert({
        where: { sku },
        update: { nameEn, nameAr, categoryID: catId, collectionID: colId, price, compareAtPrice, saleType, saleValue },
        create: {
          sku,
          nameEn,
          nameAr,
          descriptionEn: `${adjEn} ${nounEn.toLowerCase()} — part of the large demo catalogue.`,
          descriptionAr: `${nounAr} ${adjAr} — من كتالوج العرض الكبير.`,
          categoryID: catId,
          collectionID: colId,
          price,
          compareAtPrice,
          saleType,
          saleValue,
        },
      });

      // Variants: every size × every colour, random stock (some sold out).
      const variantData = colors.flatMap(([color], ci) =>
        SIZES.map((size, si) => ({
          productID: product.id,
          sku: `${sku}-${ci * SIZES.length + si + 1}`,
          size,
          color,
          stockQuantity: r() < 0.15 ? 0 : 3 + Math.floor(r() * 40),
        }))
      );
      await prisma.productVariant.deleteMany({ where: { productID: product.id } });
      await prisma.productVariant.createMany({ data: variantData });

      // Images: one generic shot + IMAGES_PER_COLOR per colour. Never empty.
      const images = [
        { productID: product.id, url: picsum(sku), altEn: nameEn, altAr: nameAr, sortOrder: 0 },
        ...colors.flatMap(([color], ci) =>
          Array.from({ length: IMAGES_PER_COLOR }, (_, k) => ({
            productID: product.id,
            url: picsum(`${sku}-${colorSlug(color)}-${k + 1}`),
            altEn: `${nameEn} — ${color} (${k + 1})`,
            altAr: `${nameAr} — ${color} (${k + 1})`,
            sortOrder: 1 + ci * IMAGES_PER_COLOR + k,
            color,
          }))
        ),
      ];
      await prisma.productImage.deleteMany({ where: { productID: product.id } });
      await prisma.productImage.createMany({ data: images });

      productCount++;
      imageCount += images.length;
    }
  }

  // ---- Site settings singleton + sample chrome (same as seed.ts) ----
  await prisma.siteSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  if ((await prisma.announcementLine.count({ where: { settingID: 1 } })) === 0) {
    await prisma.announcementLine.createMany({
      data: [
        { settingID: 1, sortOrder: 0, textEn: 'Free delivery inside the city on orders over $30', textAr: 'توصيل مجاني داخل المدينة للطلبات فوق 30$' },
        { settingID: 1, sortOrder: 1, textEn: 'Cash on delivery — pay when it arrives', textAr: 'الدفع عند الاستلام — ادفع عند وصول الطلب' },
        { settingID: 1, sortOrder: 2, textEn: 'New season styles just landed', textAr: 'تشكيلة الموسم الجديد وصلت الآن' },
      ],
    });
  }
  if ((await prisma.deliveryRate.count({ where: { settingID: 1 } })) === 0) {
    await prisma.siteSetting.update({ where: { id: 1 }, data: { deliveryFeeFlat: 3, freeDeliveryThreshold: 50 } });
    await prisma.deliveryRate.createMany({
      data: [
        { settingID: 1, sortOrder: 0, region: 'BEIRUT', fee: 2 },
        { settingID: 1, sortOrder: 1, region: 'MOUNT_LEBANON', fee: 2.5 },
      ],
    });
  }

  console.log(
    `[seed:large] done — ${productCount} products across ${categoryDefs.length} categories, ${imageCount} images (every product has some).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
