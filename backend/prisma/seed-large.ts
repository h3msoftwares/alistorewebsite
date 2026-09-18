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

/**
 * Deterministic stand-in photo — a stable seed string always resolves to the
 * same image (so re-running doesn't reshuffle a gallery), and it's a real
 * apparel shot rather than a random stock picture. Draws from a fixed pool of
 * Unsplash photos (permanent CDN URLs — loremflickr rate-limits and 500s when
 * a page pulls hundreds at once). `topic` biases which slice of the pool a
 * garment type draws from. Still placeholders — swap for genuine photos.
 */
const APPAREL_PHOTOS = [
  '1521572163474-6864f9cf17ab', '1489987707025-afc232f7ea0f', '1483985988355-763728e1935b',
  '1487222477894-8943e31ef7b2', '1490114538077-0a7f8cb49891', '1434389677669-e08b4cac3105',
  '1525507119028-ed4c629a60a3', '1503341504253-dff4815485f1', '1576566588028-4147f3842f27',
  '1620799140408-edc6dcb6d633', '1594633312681-425c7b97ccd1', '1596755094514-f87e34085b2c',
  '1618354691373-d851c5c3a990', '1542272604-787c3835535d', '1594938298603-c8148c4dae35',
  '1551232864-3f0890e580d9', '1616150638538-ffb0679a3fc4', '1571945153237-4929e783af4a',
  '1560243563-062bfc001d68', '1591047139829-d91aecb6caea', '1602810318383-e386cc2a3ccf',
  '1620012253295-c15cc3e65df4', '1598554747436-c9293d6a588f', '1607345366928-199ea26cfe3e',
  '1554568218-0f1715e72254', '1556905055-8f358a7a47b2', '1620799139507-2a76f79a2f4d',
  '1612722432474-b971cdcea546', '1503342217505-b0a15ec3261c', '1495385794356-15371f348c31',
  '1552902865-b72c031ac5ea', '1441984904996-e0b6ba687e04', '1445205170230-053b83016050',
  '1578932750294-f5075e85f44a', '1617137968427-85924c800a22', '1519238263530-99bdd11df2ea',
];

function hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function clothImage(seed: string, topic: string, w = 800, h = 1000): string {
  const id = APPAREL_PHOTOS[(hash32(seed) + hash32(topic)) % APPAREL_PHOTOS.length];
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=80`;
}

/** Garment keyword for a root category's home banner image. */
const ROOT_CATEGORY_TOPIC: Record<string, string> = { women: 'dress', men: 'menswear', kids: 'clothing' };

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

// Root categories (Stage 1: Women/Men/Kids are top-level Categories, not
// Collections — see seed.ts's comment on the same restructuring). These
// carry the storefront nav/home-banner fields that moved from Collection to
// Category with that redesign.
const rootCategoryDefs = [
  { slug: 'women', nameEn: 'Women', nameAr: 'نساء', sortOrder: 1, homeSortOrder: 10, showInNav: true, showOnHome: true, showOnHomeAsImage: false, accentColor: '#a65a7e' },
  { slug: 'men', nameEn: 'Men', nameAr: 'رجال', sortOrder: 2, homeSortOrder: 20, showInNav: true, showOnHome: true, showOnHomeAsImage: false, accentColor: '#38455c' },
  {
    slug: 'kids',
    nameEn: 'Kids',
    nameAr: 'أطفال',
    sortOrder: 4,
    homeSortOrder: 40,
    showInNav: true,
    showOnHome: false,
    showOnHomeAsImage: true,
    accentColor: '#b4611e',
    descriptionEn: 'Play-proof basics and cosy sets — soft fabrics that survive the wash and the playground.',
    descriptionAr: 'أساسيات تتحمّل اللعب وأطقم مريحة — أقمشة ناعمة تصمد أمام الغسيل والملعب.',
    homeImageCtaEn: 'Shop kids',
    homeImageCtaAr: 'تسوّق الأطفال',
  },
];

// 5 subcategories per root → 15 categories → 15 * PER_CATEGORY products.
// Tuple: [parentSlug, slug, nameEn, nameAr, sortOrder, showOnHome, homeSortOrder]
const categoryDefs = [
  ['women', 'wmn-tops', 'Tops', 'بلايز', 1, true, 12],
  ['women', 'wmn-dresses', 'Dresses', 'فساتين', 2, false, 0],
  ['women', 'wmn-knitwear', 'Knitwear', 'تريكو', 3, false, 0],
  ['women', 'wmn-bottoms', 'Bottoms', 'بناطيل وتنانير', 4, false, 0],
  ['women', 'wmn-outerwear', 'Outerwear', 'ملابس خارجية', 5, false, 0],
  ['men', 'men-shirts', 'Shirts', 'قمصان', 1, true, 22],
  ['men', 'men-tees', 'T-Shirts', 'تيشيرتات', 2, false, 0],
  ['men', 'men-knitwear', 'Knitwear', 'تريكو رجالي', 3, false, 0],
  ['men', 'men-trousers', 'Trousers', 'بناطيل', 4, false, 0],
  ['men', 'men-outerwear', 'Outerwear', 'ملابس خارجية', 5, false, 0],
  ['kids', 'kid-tops', 'Tops', 'بلايز أطفال', 1, false, 0],
  ['kids', 'kid-bottoms', 'Bottoms', 'بناطيل أطفال', 2, false, 0],
  ['kids', 'kid-sets', 'Sets', 'أطقم أطفال', 3, true, 32],
  ['kids', 'kid-outerwear', 'Outerwear', 'ملابس خارجية للأطفال', 4, false, 0],
  ['kids', 'kid-sleep', 'Sleepwear', 'ملابس نوم', 5, false, 0],
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
      name: "Ali'sStore Admin",
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
    },
  });

  // Seed is authoritative for curation: clear every nav / home flag first so
  // re-runs converge instead of accumulating stale "on home" rows.
  await prisma.category.updateMany({
    data: { showInNav: false, showOnHome: false, showOnHomeAsImage: false },
  });

  // ---- Root categories (+ one base image each) ----
  const rootCategoryId = new Map<string, string>();
  for (const c of rootCategoryDefs) {
    const { slug, ...rest } = c;
    const cat = await prisma.category.upsert({ where: { slug }, update: rest, create: c });
    rootCategoryId.set(slug, cat.id);
    await prisma.categoryImage.deleteMany({ where: { categoryID: cat.id } });
    await prisma.categoryImage.create({
      data: {
        categoryID: cat.id,
        url: clothImage(`category-${slug}`, ROOT_CATEGORY_TOPIC[slug] ?? 'clothing'),
        altEn: c.nameEn,
        altAr: c.nameAr,
        sortOrder: 0,
      },
    });
  }

  // ---- Subcategories ----
  const categoryId = new Map<string, string>();
  for (const [parentSlug, slug, nameEn, nameAr, sortOrder, showOnHome, homeSortOrder] of categoryDefs) {
    const data = {
      nameEn,
      nameAr,
      slug,
      parentID: rootCategoryId.get(parentSlug)!,
      sortOrder,
      showOnHome,
      homeSortOrder,
    };
    const cat = await prisma.category.upsert({ where: { slug }, update: data, create: data });
    categoryId.set(slug, cat.id);
  }

  // ---- Products — procedurally generated, every one with a full image set ----
  let productCount = 0;
  let imageCount = 0;

  for (const cd of categoryDefs) {
    const catSlug = cd[1];
    const catId = categoryId.get(catSlug)!;

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
        update: { nameEn, nameAr, primaryCategoryID: catId, price, compareAtPrice, saleType, saleValue },
        create: {
          sku,
          nameEn,
          nameAr,
          descriptionEn: `${adjEn} ${nounEn.toLowerCase()} — part of the large demo catalogue.`,
          descriptionAr: `${nounAr} ${adjAr} — من كتالوج العرض الكبير.`,
          primaryCategoryID: catId,
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
      // Insert only the variants that don't exist yet (deterministic SKUs), so
      // re-running the seed on a DB that already has orders never trips
      // `orderitem_variantID_fkey` — unlike a delete-and-recreate. Existing
      // variants keep their current stock; a first run creates the full set.
      await prisma.productVariant.createMany({ data: variantData, skipDuplicates: true });

      // Images: one generic shot + IMAGES_PER_COLOR per colour. Never empty.
      // Topic is the product's own garment noun ("shirt", "dress", "hoodie", …)
      // so every gallery is on-theme.
      const topic = nounEn.toLowerCase();
      const images = [
        { productID: product.id, url: clothImage(sku, topic), altEn: nameEn, altAr: nameAr, sortOrder: 0 },
        ...colors.flatMap(([color], ci) =>
          Array.from({ length: IMAGES_PER_COLOR }, (_, k) => ({
            productID: product.id,
            url: clothImage(`${sku}-${colorSlug(color)}-${k + 1}`, topic),
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

  // ---- Promotions (Stage 2 catalog redesign — Promotion replaces the old
  // flat Discount model; see seed.ts's fuller writeup). A modest, deterministic
  // spread across the big catalog — one site-wide + one per root category —
  // so pricing/admin-promo-banner/category-targeting have real coverage to
  // exercise at this catalog's actual scale, not just seed.ts's hand-picked
  // few. Fixed IDs in a distinct 5xxx range so a DB seeded from both scripts
  // never collides with seed.ts's own 00f1–00f5 promotions. ----
  const bigCatalogSale = await prisma.promotion.upsert({
    where: { id: '00000000-0000-4000-8000-000000005000' },
    update: { nameEn: 'Big Catalog Sale', nameAr: 'تخفيضات الكتالوج الكبير', status: 'ACTIVE', type: 'PERCENT', value: 10, priority: 0, stackable: true, appliesToAll: true },
    create: { id: '00000000-0000-4000-8000-000000005000', nameEn: 'Big Catalog Sale', nameAr: 'تخفيضات الكتالوج الكبير', status: 'ACTIVE', type: 'PERCENT', value: 10, priority: 0, stackable: true, appliesToAll: true },
  });
  await prisma.promotionProduct.deleteMany({ where: { promotionID: bigCatalogSale.id } });
  await prisma.promotionCategory.deleteMany({ where: { promotionID: bigCatalogSale.id } });
  await prisma.promotionCollection.deleteMany({ where: { promotionID: bigCatalogSale.id } });

  const rootPromotionDefs = [
    { rootSlug: 'women', id: '00000000-0000-4000-8000-000000005001', nameEn: 'Women Seasonal Sale', nameAr: 'تخفيضات موسم النساء', type: 'PERCENT' as const, value: 15, priority: 1, stackable: true },
    { rootSlug: 'men', id: '00000000-0000-4000-8000-000000005002', nameEn: 'Men Seasonal Sale', nameAr: 'تخفيضات موسم الرجال', type: 'PERCENT' as const, value: 15, priority: 1, stackable: true },
    // Higher priority + non-stackable so it demonstrably wins over the
    // site-wide sale above for kids products (single-winner-by-priority).
    { rootSlug: 'kids', id: '00000000-0000-4000-8000-000000005003', nameEn: 'Kids VIP Deal', nameAr: 'عرض الأطفال المميز', type: 'AMOUNT' as const, value: 5, priority: 5, stackable: false },
  ];
  for (const p of rootPromotionDefs) {
    const rootId = rootCategoryId.get(p.rootSlug)!;
    const promo = await prisma.promotion.upsert({
      where: { id: p.id },
      update: { nameEn: p.nameEn, nameAr: p.nameAr, status: 'ACTIVE', type: p.type, value: p.value, priority: p.priority, stackable: p.stackable, appliesToAll: false },
      create: { id: p.id, nameEn: p.nameEn, nameAr: p.nameAr, status: 'ACTIVE', type: p.type, value: p.value, priority: p.priority, stackable: p.stackable, appliesToAll: false },
    });
    await prisma.promotionProduct.deleteMany({ where: { promotionID: promo.id } });
    await prisma.promotionCollection.deleteMany({ where: { promotionID: promo.id } });
    await prisma.promotionCategory.deleteMany({ where: { promotionID: promo.id } });
    await prisma.promotionCategory.create({ data: { promotionID: promo.id, categoryID: rootId, includeDescendants: true } });
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
  // Built-in smart home rows — on + interleaved with the collections in the
  // shared "Home page order" (women 10, men 20, kids-sets 32, kids banner 40).
  for (const s of [
    { type: 'NEW_ARRIVALS' as const, sortOrder: 15 },
    { type: 'BEST_SELLERS' as const, sortOrder: 25 },
    { type: 'ON_SALE' as const, sortOrder: 35 },
  ]) {
    await prisma.homeShowcase.upsert({
      where: { type: s.type },
      create: { type: s.type, settingID: 1, isActive: true, sortOrder: s.sortOrder },
      update: { isActive: true, sortOrder: s.sortOrder },
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
    `[seed:large] done — ${productCount} products across ${rootCategoryDefs.length + categoryDefs.length} categories, ${imageCount} images (every product has some), ${1 + rootPromotionDefs.length} promotions.`
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
