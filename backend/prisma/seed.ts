import { PrismaClient, type DiscountType } from '@prisma/client';
import argon2 from 'argon2';

// Load backend/.env (same mechanism as src/config/env.ts) so SEED_ADMIN_PASSWORD
// — and DATABASE_URL — are available whether this runs via `npm run seed`
// locally or with real env vars injected in CI. Node's native loader; no dep.
try {
  process.loadEnvFile();
} catch {
  // no .env file on disk — assume the environment already provides these vars
}

const prisma = new PrismaClient();

/** The initial admin password comes from the environment and is Argon2-hashed
 *  here at seed time. The plaintext is never written to the database and never
 *  committed to source — see backend/.env.example. */
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
 * Deterministic per-item clothing photo. A given seed string always resolves
 * to the same picture (so reseeding never reshuffles a card), and it's a real
 * apparel shot rather than a random stock image. Draws from a fixed pool of
 * Unsplash photos (permanent CDN URLs, unlike loremflickr which rate-limits
 * and 500s when a page loads hundreds at once). `topic` biases which slice of
 * the pool a garment type draws from. Still placeholders — swap
 * `ProductImage.url` for the shop's own photos before launch.
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

/** A garment keyword per category / collection slug — nudges which apparel
 *  photos the type tends to draw from. */
const CLOTH_TOPIC: Record<string, string> = {
  'women-lingerie': 'underwear',
  'women-nightwear': 'pajamas',
  'men-shirts': 'shirt',
  'men-underwear': 'underwear',
  'kids-pajamas': 'pajamas',
  'kids-everyday': 'clothing',
  women: 'dress',
  men: 'menswear',
  kids: 'clothing',
};
const clothTopicFor = (slug: string): string => CLOTH_TOPIC[slug] ?? 'clothing';

interface VariantDef {
  size?: string;
  color?: string;
  /** Per-variant price override — omit to fall back to the product's price. */
  price?: number;
  stockQuantity: number;
}

interface ProductDef {
  sku: string;
  categorySlug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  price: number;
  compareAtPrice?: number | null;
  saleType?: DiscountType;
  saleValue?: number;
  variants: VariantDef[];
}

function v(size: string | undefined, color: string | undefined, stockQuantity: number, price?: number): VariantDef {
  return { size, color, stockQuantity, price };
}

async function main() {
  console.log('[seed] starting…');

  // ---- RBAC: a built-in "Full access" role + a couple of example roles ----
  const allPermissions = [
    'dashboard:view',
    'orders:view', 'orders:manage',
    'products:view', 'products:manage',
    'collections:view', 'collections:manage',
    'categories:view', 'categories:manage',
    'discounts:view', 'discounts:manage',
    'analytics:view',
    'settings:view', 'settings:manage',
    'roles:view', 'roles:manage',
  ];
  await prisma.role.upsert({
    where: { name: 'Full access' },
    update: { permissions: allPermissions, isSystem: true },
    create: { name: 'Full access', description: 'Every admin permission.', permissions: allPermissions, isSystem: true },
  });
  await prisma.role.upsert({
    where: { name: 'Order desk' },
    update: {},
    create: {
      name: 'Order desk',
      description: 'Work orders and see the dashboard; no catalog or settings access.',
      permissions: ['dashboard:view', 'orders:view', 'orders:manage'],
    },
  });
  await prisma.role.upsert({
    where: { name: 'Catalog editor' },
    update: {},
    create: {
      name: 'Catalog editor',
      description: 'Manage products, collections, categories and discounts.',
      permissions: [
        'dashboard:view',
        'products:view', 'products:manage',
        'collections:view', 'collections:manage',
        'categories:view', 'categories:manage',
        'discounts:view', 'discounts:manage',
      ],
    },
  });

  // ---- Admin user ----
  const adminPasswordHash = await argon2.hash(requireSeedAdminPassword());
  await prisma.user.upsert({
    where: { email: 'admin@alistore.com' },
    // Keep the admin's email marked verified (the storefront gates sign-in on
    // it); harmless to re-affirm on every seed.
    update: { emailVerified: new Date() },
    create: {
      email: 'admin@alistore.com',
      name: "Ali's Store Admin",
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
    },
  });

  // ---- Example STAFF user (so the Team tab isn't empty in dev) ----
  // Same seed password as the admin; signs in at /ali-admin-login. Scoped to
  // the "Order desk" role, so a good demo of the permission gating.
  const orderDesk = await prisma.role.findUnique({ where: { name: 'Order desk' }, select: { id: true } });
  await prisma.user.upsert({
    where: { email: 'staff@alistore.com' },
    update: { emailVerified: new Date(), customRoleID: orderDesk?.id ?? null },
    create: {
      email: 'staff@alistore.com',
      name: 'Order Desk Staff',
      role: 'STAFF',
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
      customRoleID: orderDesk?.id ?? null,
    },
  });

  // ---- Categories (the permanent navigation tree — see
  // robust-ecommerce-catalog-architecture.md's "core idea") ----
  // Root categories carry the storefront chrome (nav placement + full-bleed
  // home banner) that used to live on Collection: Stage 1 of the catalog
  // redesign decouples Category from Collection entirely, so Women/Men/Kids
  // become top-level Categories and inherit that role (see
  // catalog-redesign-implementation-plan.md's nav/banner decision). women +
  // men get their own home "row" (showOnHome); kids demos the full-width
  // image-banner treatment (showOnHomeAsImage) instead — a coloured panel
  // with the description + CTA, and the photo.
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

  // Seed is authoritative for curation: clear every nav / home flag first, then
  // the upserts below set only the intended ones back on. Keeps re-runs
  // converging instead of accumulating stale "on home" rows from old seeds.
  await prisma.category.updateMany({
    data: { showInNav: false, showOnHome: false, showOnHomeAsImage: false },
  });

  // Roots first — a child's `parent: { connect }` needs the parent row to
  // already exist (the path/depth trigger looks up the parent's current
  // path/depth — see migration 20260912000000).
  const categories = new Map<string, { id: string }>();
  for (const c of rootCategoryDefs) {
    const { slug, ...rest } = c;
    const cat = await prisma.category.upsert({
      where: { slug },
      update: rest,
      create: c,
    });
    categories.set(c.slug, { id: cat.id });

    // One base image per root category so the home image-grid tile (and the
    // admin list thumbnail) has a picture. Replace-all keeps reseeding
    // idempotent.
    await prisma.categoryImage.deleteMany({ where: { categoryID: cat.id } });
    await prisma.categoryImage.create({
      data: {
        categoryID: cat.id,
        url: clothImage(`category-${c.slug}`, clothTopicFor(c.slug)),
        altEn: c.nameEn,
        altAr: c.nameAr,
        sortOrder: 0,
      },
    });
  }

  // ---- Subcategories (bilingual, each nested under one root category) ----
  // kids-pajamas is individually featured too, to demo a category getting its
  // own "product row" on the home page independent of its parent.
  const subcategoryDefs = [
    { parentSlug: 'women', nameEn: 'Lingerie', nameAr: 'ملابس داخلية نسائية', slug: 'women-lingerie', sortOrder: 1 },
    { parentSlug: 'women', nameEn: 'Nightwear', nameAr: 'ملابس النوم النسائية', slug: 'women-nightwear', sortOrder: 2 },
    { parentSlug: 'men', nameEn: "Men's Shirts", nameAr: 'قمصان رجالي', slug: 'men-shirts', sortOrder: 1 },
    { parentSlug: 'men', nameEn: "Men's Underwear", nameAr: 'ملابس داخلية رجالية', slug: 'men-underwear', sortOrder: 2 },
    { parentSlug: 'kids', nameEn: "Kids' Pajamas", nameAr: 'بيجامات أطفال', slug: 'kids-pajamas', sortOrder: 4, homeSortOrder: 30, showOnHome: true },
    { parentSlug: 'kids', nameEn: "Kids' Everyday", nameAr: 'ملابس أطفال يومية', slug: 'kids-everyday', sortOrder: 2 },
  ];

  for (const c of subcategoryDefs) {
    const parentID = categories.get(c.parentSlug)!.id;
    const data = {
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      slug: c.slug,
      parentID,
      sortOrder: c.sortOrder,
      showOnHome: c.showOnHome ?? false,
      homeSortOrder: 'homeSortOrder' in c ? c.homeSortOrder : 0,
    };
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: data,
      create: data,
    });
    categories.set(c.slug, { id: cat.id });
  }

  // ---- Products + variants ----
  // 20 per category (120 total) — enough to stress-test the related-products
  // horizontal scroller with a realistic amount of content, not just enough
  // to fill its cap. Deliberately varied per product: some on an active sale
  // (PERCENT or AMOUNT), some just carrying a compareAtPrice with no active
  // sale, some at plain price; stock spans out-of-stock / low (≤5) / healthy
  // across variants; a few variants carry their own price override.
  const productDefs: ProductDef[] = [
    // ---- Women / Lingerie ----
    {
      sku: 'WOM-LNG-001',
      categorySlug: 'women-lingerie',
      nameEn: 'Lace Trim Bralette Set',
      nameAr: 'طقم بروليت بحواف دانتيل',
      descriptionEn: 'Soft lace-trim bralette and matching bottom, everyday comfort fit.',
      descriptionAr: 'طقم بروليت بحواف دانتيل ناعمة مع تحتاني مطابق، مريح للاستخدام اليومي.',
      price: 28.0,
      saleType: 'PERCENT',
      saleValue: 20,
      variants: [
        v('S', 'Black', 12),
        v('M', 'Black', 20),
        v('L', 'Black', 3),
        v('S', 'Beige', 0),
        v('M', 'Beige', 15),
      ],
    },
    {
      sku: 'WOM-LNG-002',
      categorySlug: 'women-lingerie',
      nameEn: 'Seamless Bralette',
      nameAr: 'بروليت بلا خياطة',
      descriptionEn: 'Wire-free seamless bralette, light support for all-day wear.',
      descriptionAr: 'بروليت بلا خياطة وبدون سلك، دعم خفيف للارتداء طوال اليوم.',
      price: 19.0,
      compareAtPrice: 24.0,
      variants: [v('S', 'Nude', 18), v('M', 'Nude', 20), v('L', 'Nude', 4), v('M', 'Black', 10)],
    },
    {
      sku: 'WOM-LNG-003',
      categorySlug: 'women-lingerie',
      nameEn: 'Cotton Brief 5-Pack',
      nameAr: 'شورت قطني - عبوة ٥ قطع',
      descriptionEn: 'Everyday cotton briefs, pack of 5, tagless waistband.',
      descriptionAr: 'شورت قطني للاستخدام اليومي، عبوة من ٥ قطع، بدون بطاقة مزعجة.',
      price: 22.0,
      variants: [v('S', 'Assorted', 20), v('M', 'Assorted', 20), v('L', 'Assorted', 0), v('XL', 'Assorted', 6)],
    },
    {
      sku: 'WOM-LNG-004',
      categorySlug: 'women-lingerie',
      nameEn: 'Lace Trim Chemise',
      nameAr: 'شيميز بحواف دانتيل',
      descriptionEn: 'Silky chemise with lace trim neckline, adjustable straps.',
      descriptionAr: 'شيميز حريري بحواف دانتيل عند الرقبة، بحمالات قابلة للتعديل.',
      price: 34.0,
      saleType: 'AMOUNT',
      saleValue: 8,
      variants: [v('S', 'Wine', 9), v('M', 'Wine', 2), v('L', 'Wine', 0), v('M', 'Black', 14, 36)],
    },
    {
      sku: 'WOM-LNG-005',
      categorySlug: 'women-lingerie',
      nameEn: 'High-Waist Shaping Brief',
      nameAr: 'شورت شد عالي الخصر',
      descriptionEn: 'Smoothing high-waist brief, light compression, breathable fabric.',
      descriptionAr: 'شورت شد عالي الخصر بضغط خفيف وقماش قابل للتنفس.',
      price: 26.0,
      variants: [v('S', 'Black', 20), v('M', 'Black', 20), v('L', 'Black', 20), v('XL', 'Black', 5)],
    },
    {
      sku: 'WOM-LNG-006',
      categorySlug: 'women-lingerie',
      nameEn: 'Floral Lace Bralette',
      nameAr: 'بروليت دانتيل بطبعة أزهار',
      descriptionEn: 'Delicate floral lace bralette with adjustable straps.',
      descriptionAr: 'بروليت دانتيل رقيق بطبعة أزهار وحمالات قابلة للتعديل.',
      price: 24.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('S', 'Ivory', 15), v('M', 'Ivory', 20), v('L', 'Ivory', 0), v('M', 'Blush', 10)],
    },
    {
      sku: 'WOM-LNG-007',
      categorySlug: 'women-lingerie',
      nameEn: 'Push-Up Balcony Bra',
      nameAr: 'حمالة بوش أب بلكوني',
      descriptionEn: 'Push-up balcony bra with light padding for extra lift.',
      descriptionAr: 'حمالة بوش أب بلكوني بحشوة خفيفة لرفع إضافي.',
      price: 27.0,
      compareAtPrice: 34.0,
      variants: [v('S', 'Black', 10), v('M', 'Black', 20), v('L', 'Black', 5)],
    },
    {
      sku: 'WOM-LNG-008',
      categorySlug: 'women-lingerie',
      nameEn: 'Wireless T-Shirt Bra',
      nameAr: 'حمالة تي شيرت بدون سلك',
      descriptionEn: 'Smooth wireless t-shirt bra, seamless cups under fitted tops.',
      descriptionAr: 'حمالة تي شيرت بدون سلك بأكواب ناعمة بدون خياطة تحت الملابس الضيقة.',
      price: 22.0,
      variants: [v('S', 'Nude', 20), v('M', 'Nude', 20), v('L', 'Nude', 20), v('XL', 'Nude', 6)],
    },
    {
      sku: 'WOM-LNG-009',
      categorySlug: 'women-lingerie',
      nameEn: 'Thong 3-Pack',
      nameAr: 'ثونج - عبوة ٣ قطع',
      descriptionEn: 'Everyday stretch-lace thongs, pack of 3.',
      descriptionAr: 'ثونج دانتيل قابل للتمدد للاستخدام اليومي، عبوة من ٣ قطع.',
      price: 18.0,
      variants: [v('S', 'Assorted', 20), v('M', 'Assorted', 20), v('L', 'Assorted', 3)],
    },
    {
      sku: 'WOM-LNG-010',
      categorySlug: 'women-lingerie',
      nameEn: 'High-Waist Brief 3-Pack',
      nameAr: 'شورت عالي الخصر - عبوة ٣ قطع',
      descriptionEn: 'Soft cotton high-waist briefs, pack of 3.',
      descriptionAr: 'شورت قطني عالي الخصر ناعم، عبوة من ٣ قطع.',
      price: 25.0,
      saleType: 'AMOUNT',
      saleValue: 6,
      variants: [v('S', 'Black', 20), v('M', 'Black', 20), v('L', 'Black', 0), v('XL', 'Black', 8)],
    },
    {
      sku: 'WOM-LNG-011',
      categorySlug: 'women-lingerie',
      nameEn: 'Longline Bralette',
      nameAr: 'بروليت طويل',
      descriptionEn: 'Longline bralette with a wide comfort band.',
      descriptionAr: 'بروليت بتصميم طويل وحزام واسع مريح.',
      price: 29.0,
      compareAtPrice: 35.0,
      variants: [v('S', 'Charcoal', 9), v('M', 'Charcoal', 20), v('L', 'Charcoal', 20)],
    },
    {
      sku: 'WOM-LNG-012',
      categorySlug: 'women-lingerie',
      nameEn: 'Lace Balconette Bra',
      nameAr: 'حمالة بلكونيت دانتيل',
      descriptionEn: 'Sheer lace balconette bra with a scalloped edge.',
      descriptionAr: 'حمالة بلكونيت من الدانتيل الشفاف بحافة مزخرفة.',
      price: 26.0,
      saleType: 'PERCENT',
      saleValue: 10,
      variants: [v('S', 'Black', 14), v('M', 'Black', 20), v('L', 'Black', 2)],
    },
    {
      sku: 'WOM-LNG-013',
      categorySlug: 'women-lingerie',
      nameEn: 'Cotton Bikini Brief 5-Pack',
      nameAr: 'شورت بيكيني قطني - عبوة ٥ قطع',
      descriptionEn: 'Tagless cotton bikini briefs, pack of 5.',
      descriptionAr: 'شورت بيكيني قطني بدون بطاقة، عبوة من ٥ قطع.',
      price: 23.0,
      variants: [v('S', 'Assorted', 20), v('M', 'Assorted', 20), v('L', 'Assorted', 20), v('XL', 'Assorted', 0)],
    },
    {
      sku: 'WOM-LNG-014',
      categorySlug: 'women-lingerie',
      nameEn: 'Strapless Bra',
      nameAr: 'حمالة بدون حمالات',
      descriptionEn: 'Silicone-grip strapless bra for backless and off-shoulder tops.',
      descriptionAr: 'حمالة بدون حمالات بحواف سيليكون مانعة للانزلاق.',
      price: 30.0,
      variants: [v('S', 'Nude', 6), v('M', 'Nude', 20, 32), v('L', 'Nude', 20, 32)],
    },
    {
      sku: 'WOM-LNG-015',
      categorySlug: 'women-lingerie',
      nameEn: 'Mesh Bralette',
      nameAr: 'بروليت شبك',
      descriptionEn: 'Sheer mesh bralette with a minimal, unlined fit.',
      descriptionAr: 'بروليت من الشبك الشفاف بقصة خفيفة بدون حشوة.',
      price: 20.0,
      saleType: 'PERCENT',
      saleValue: 25,
      variants: [v('S', 'Black', 20), v('M', 'Black', 20), v('L', 'Black', 20)],
    },
    {
      sku: 'WOM-LNG-016',
      categorySlug: 'women-lingerie',
      nameEn: 'Shapewear Slip',
      nameAr: 'سليب شد',
      descriptionEn: 'Smoothing full slip with a light-compression shapewear panel.',
      descriptionAr: 'سليب كامل بلوحة شد خفيفة لإخفاء العيوب.',
      price: 32.0,
      compareAtPrice: 40.0,
      variants: [v('S', 'Black', 5), v('M', 'Black', 20), v('L', 'Black', 20), v('XL', 'Black', 0)],
    },
    {
      sku: 'WOM-LNG-017',
      categorySlug: 'women-lingerie',
      nameEn: 'Racerback Bralette',
      nameAr: 'بروليت ظهر سباحة',
      descriptionEn: 'Sporty racerback bralette, light support for daily wear.',
      descriptionAr: 'بروليت بظهر سباحة رياضي، دعم خفيف للارتداء اليومي.',
      price: 21.0,
      variants: [v('S', 'Grey', 20), v('M', 'Grey', 20), v('L', 'Grey', 4)],
    },
    {
      sku: 'WOM-LNG-018',
      categorySlug: 'women-lingerie',
      nameEn: 'Boyshort 3-Pack',
      nameAr: 'بويشورت - عبوة ٣ قطع',
      descriptionEn: 'Full-coverage cotton boyshorts, pack of 3.',
      descriptionAr: 'بويشورت قطني بتغطية كاملة، عبوة من ٣ قطع.',
      price: 24.0,
      variants: [v('M', 'Assorted', 20), v('L', 'Assorted', 20), v('XL', 'Assorted', 5)],
    },
    {
      sku: 'WOM-LNG-019',
      categorySlug: 'women-lingerie',
      nameEn: 'Lace Garter Set',
      nameAr: 'طقم جارتر دانتيل',
      descriptionEn: 'Lace bralette and garter belt set.',
      descriptionAr: 'طقم بروليت دانتيل مع حزام جارتر.',
      price: 36.0,
      saleType: 'AMOUNT',
      saleValue: 10,
      variants: [v('S', 'Black', 3), v('M', 'Black', 10), v('L', 'Black', 0)],
    },
    {
      sku: 'WOM-LNG-020',
      categorySlug: 'women-lingerie',
      nameEn: 'Padded Demi Bra',
      nameAr: 'حمالة ديمي محشوة',
      descriptionEn: 'Light-padding demi bra with a rounded, natural shape.',
      descriptionAr: 'حمالة ديمي بحشوة خفيفة وشكل طبيعي مستدير.',
      price: 28.0,
      compareAtPrice: 34.0,
      variants: [v('S', 'Beige', 20, 28), v('M', 'Beige', 1, 28), v('L', 'Beige', 20, 30)],
    },

    // ---- Women / Nightwear ----
    {
      sku: 'WOM-NGT-001',
      categorySlug: 'women-nightwear',
      nameEn: 'Satin Nightgown',
      nameAr: 'قميص نوم ساتان',
      descriptionEn: 'Lightweight satin nightgown with adjustable straps.',
      descriptionAr: 'قميص نوم من الساتان الخفيف بحمالات قابلة للتعديل.',
      price: 32.0,
      variants: [v('M', 'Rose', 20), v('L', 'Rose', 1), v('M', 'Navy', 20)],
    },
    {
      sku: 'WOM-NGT-002',
      categorySlug: 'women-nightwear',
      nameEn: 'Cotton Pajama Set',
      nameAr: 'طقم بيجاما قطني',
      descriptionEn: 'Breathable cotton pajama top + pants set for cooler nights.',
      descriptionAr: 'طقم بيجاما قطني (علوي وبنطلون) مريح للليالي الباردة.',
      price: 29.0,
      compareAtPrice: 36.0,
      variants: [v('S', 'Grey', 20), v('M', 'Grey', 20), v('L', 'Grey', 0), v('M', 'Pink', 8)],
    },
    {
      sku: 'WOM-NGT-003',
      categorySlug: 'women-nightwear',
      nameEn: 'Fleece Robe',
      nameAr: 'روب فليس',
      descriptionEn: 'Plush fleece robe with tie belt and side pockets.',
      descriptionAr: 'روب فليس ناعم بحزام ربط وجيوب جانبية.',
      price: 38.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('S/M', 'Burgundy', 14), v('L/XL', 'Burgundy', 3)],
    },
    {
      sku: 'WOM-NGT-004',
      categorySlug: 'women-nightwear',
      nameEn: 'Satin Pajama Shorts Set',
      nameAr: 'طقم شورت بيجاما ساتان',
      descriptionEn: 'Satin cami top and shorts set, cool-to-the-touch finish.',
      descriptionAr: 'طقم كامي وشورت من الساتان بملمس بارد ومريح.',
      price: 27.0,
      variants: [v('S', 'Champagne', 20), v('M', 'Champagne', 20), v('L', 'Champagne', 20)],
    },
    {
      sku: 'WOM-NGT-005',
      categorySlug: 'women-nightwear',
      nameEn: 'Long Sleeve Nightshirt',
      nameAr: 'قميص نوم بأكمام طويلة',
      descriptionEn: 'Brushed cotton nightshirt with long sleeves for winter nights.',
      descriptionAr: 'قميص نوم قطني مصقول بأكمام طويلة لليالي الشتاء.',
      price: 24.0,
      compareAtPrice: 29.0,
      variants: [v('M', 'Plaid', 5), v('L', 'Plaid', 0), v('XL', 'Plaid', 12)],
    },
    {
      sku: 'WOM-NGT-006',
      categorySlug: 'women-nightwear',
      nameEn: 'Silk Cami Pajama Set',
      nameAr: 'طقم بيجاما كامي حرير',
      descriptionEn: 'Silky cami top and shorts pajama set.',
      descriptionAr: 'طقم بيجاما (كامي وشورت) من الحرير الصناعي الناعم.',
      price: 33.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('S', 'Ivory', 10), v('M', 'Ivory', 20), v('L', 'Ivory', 0)],
    },
    {
      sku: 'WOM-NGT-007',
      categorySlug: 'women-nightwear',
      nameEn: 'Waffle Knit Robe',
      nameAr: 'روب وافل',
      descriptionEn: 'Lightweight waffle-knit robe with a tie belt.',
      descriptionAr: 'روب خفيف بنسيج وافل مع حزام ربط.',
      price: 34.0,
      compareAtPrice: 42.0,
      variants: [v('S/M', 'Sage', 12), v('L/XL', 'Sage', 20)],
    },
    {
      sku: 'WOM-NGT-008',
      categorySlug: 'women-nightwear',
      nameEn: 'Jersey Nightdress',
      nameAr: 'قميص نوم جيرسيه',
      descriptionEn: 'Soft jersey nightdress, relaxed fit.',
      descriptionAr: 'قميص نوم من الجيرسيه الناعم بقصة مريحة.',
      price: 22.0,
      variants: [v('S', 'Grey Marl', 20), v('M', 'Grey Marl', 20), v('L', 'Grey Marl', 7)],
    },
    {
      sku: 'WOM-NGT-009',
      categorySlug: 'women-nightwear',
      nameEn: 'Fleece Pajama Pants',
      nameAr: 'بنطلون بيجاما فليس',
      descriptionEn: 'Cozy fleece pajama pants with an elastic waistband.',
      descriptionAr: 'بنطلون بيجاما فليس دافئ بحزام مطاطي.',
      price: 18.0,
      variants: [v('S', 'Plaid', 20), v('M', 'Plaid', 20), v('L', 'Plaid', 20), v('XL', 'Plaid', 0)],
    },
    {
      sku: 'WOM-NGT-010',
      categorySlug: 'women-nightwear',
      nameEn: 'Satin Robe',
      nameAr: 'روب ساتان',
      descriptionEn: 'Elegant satin robe with lace-trim cuffs.',
      descriptionAr: 'روب ساتان أنيق بأكمام مزينة بالدانتيل.',
      price: 40.0,
      saleType: 'AMOUNT',
      saleValue: 8,
      variants: [v('S/M', 'Wine', 9), v('L/XL', 'Wine', 3)],
    },
    {
      sku: 'WOM-NGT-011',
      categorySlug: 'women-nightwear',
      nameEn: 'Cotton Nightshirt',
      nameAr: 'قميص نوم قطني',
      descriptionEn: 'Classic button-front cotton nightshirt.',
      descriptionAr: 'قميص نوم قطني كلاسيكي بأزرار أمامية.',
      price: 23.0,
      variants: [v('S', 'White', 20), v('M', 'White', 20), v('L', 'White', 20)],
    },
    {
      sku: 'WOM-NGT-012',
      categorySlug: 'women-nightwear',
      nameEn: 'Two-Piece Shorts Pajama Set',
      nameAr: 'طقم بيجاما شورت قطعتين',
      descriptionEn: 'Breathable tee and shorts pajama set.',
      descriptionAr: 'طقم بيجاما (تيشيرت وشورت) قابل للتنفس.',
      price: 26.0,
      compareAtPrice: 31.0,
      variants: [v('S', 'Sky Blue', 20), v('M', 'Sky Blue', 5), v('L', 'Sky Blue', 20)],
    },
    {
      sku: 'WOM-NGT-013',
      categorySlug: 'women-nightwear',
      nameEn: 'Velour Robe',
      nameAr: 'روب مخمل',
      descriptionEn: 'Plush velour robe with a hood and side pockets.',
      descriptionAr: 'روب من المخمل الناعم بغطاء رأس وجيوب جانبية.',
      price: 44.0,
      variants: [v('S/M', 'Blush', 6), v('L/XL', 'Blush', 14)],
    },
    {
      sku: 'WOM-NGT-014',
      categorySlug: 'women-nightwear',
      nameEn: 'Printed Nightgown',
      nameAr: 'قميص نوم مطبوع',
      descriptionEn: 'Breezy printed nightgown, sleeveless cut.',
      descriptionAr: 'قميص نوم خفيف بطبعة زهور وقصة بدون أكمام.',
      price: 21.0,
      saleType: 'PERCENT',
      saleValue: 20,
      variants: [v('S', 'Floral', 20), v('M', 'Floral', 20), v('L', 'Floral', 0)],
    },
    {
      sku: 'WOM-NGT-015',
      categorySlug: 'women-nightwear',
      nameEn: 'Thermal Pajama Set',
      nameAr: 'طقم بيجاما حراري',
      descriptionEn: 'Fleece-lined thermal pajama set for cold nights.',
      descriptionAr: 'طقم بيجاما حراري مبطن بالفليس لليالي الباردة.',
      price: 36.0,
      compareAtPrice: 44.0,
      variants: [v('S', 'Charcoal', 20), v('M', 'Charcoal', 20), v('L', 'Charcoal', 1)],
    },
    {
      sku: 'WOM-NGT-016',
      categorySlug: 'women-nightwear',
      nameEn: 'Kimono Robe',
      nameAr: 'روب كيمونو',
      descriptionEn: 'Printed kimono-style robe, tie-waist, midi length.',
      descriptionAr: 'روب بتصميم كيمونو مطبوع بحزام خصر وطول متوسط.',
      price: 31.0,
      variants: [v('One Size', 'Botanical', 20)],
    },
    {
      sku: 'WOM-NGT-017',
      categorySlug: 'women-nightwear',
      nameEn: 'Ribbed Cami Pajama Set',
      nameAr: 'طقم بيجاما كامي مضلع',
      descriptionEn: 'Ribbed knit cami and shorts pajama set.',
      descriptionAr: 'طقم بيجاما (كامي وشورت) بنسيج مضلع.',
      price: 25.0,
      saleType: 'AMOUNT',
      saleValue: 5,
      variants: [v('S', 'Lilac', 20), v('M', 'Lilac', 20), v('L', 'Lilac', 4)],
    },
    {
      sku: 'WOM-NGT-018',
      categorySlug: 'women-nightwear',
      nameEn: 'Terry Cloth Robe',
      nameAr: 'روب تيري',
      descriptionEn: 'Absorbent terry cloth robe, spa-style shawl collar.',
      descriptionAr: 'روب تيري ماص للماء بياقة شال بطراز السبا.',
      price: 38.0,
      compareAtPrice: 46.0,
      variants: [v('S/M', 'White', 10), v('L/XL', 'White', 20)],
    },
    {
      sku: 'WOM-NGT-019',
      categorySlug: 'women-nightwear',
      nameEn: 'Modal Nightgown',
      nameAr: 'قميص نوم مودال',
      descriptionEn: 'Buttery-soft modal nightgown with adjustable straps.',
      descriptionAr: 'قميص نوم من قماش المودال الناعم بحمالات قابلة للتعديل.',
      price: 27.0,
      variants: [v('S', 'Dusty Rose', 20), v('M', 'Dusty Rose', 20), v('L', 'Dusty Rose', 20)],
    },
    {
      sku: 'WOM-NGT-020',
      categorySlug: 'women-nightwear',
      nameEn: 'Flannel Pajama Set',
      nameAr: 'طقم بيجاما فانيلا',
      descriptionEn: 'Brushed flannel button-up pajama set, plaid print.',
      descriptionAr: 'طقم بيجاما فانيلا بأزرار ونقشة كاروهات.',
      price: 30.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('S', 'Red Plaid', 12), v('M', 'Red Plaid', 20), v('L', 'Red Plaid', 0), v('XL', 'Red Plaid', 6)],
    },

    // ---- Men / Shirts ----
    {
      sku: 'MEN-SHT-001',
      categorySlug: 'men-shirts',
      nameEn: 'Classic Cotton Shirt',
      nameAr: 'قميص قطني كلاسيكي',
      descriptionEn: 'Breathable 100% cotton shirt, regular fit.',
      descriptionAr: 'قميص قطني ١٠٠٪ قابل للتنفس، قصة عادية.',
      price: 39.0,
      compareAtPrice: 49.0,
      variants: [
        v('M', 'White', 20),
        v('L', 'White', 20),
        v('XL', 'White', 4),
        v('M', 'Light Blue', 20),
        v('L', 'Light Blue', 0),
      ],
    },
    {
      sku: 'MEN-SHT-002',
      categorySlug: 'men-shirts',
      nameEn: 'Linen Short-Sleeve Shirt',
      nameAr: 'قميص كتان بأكمام قصيرة',
      descriptionEn: 'Airy linen-blend shirt, short sleeves, relaxed fit.',
      descriptionAr: 'قميص من مزيج الكتان الخفيف بأكمام قصيرة وقصة مريحة.',
      price: 35.0,
      saleType: 'PERCENT',
      saleValue: 25,
      variants: [v('M', 'Sand', 20), v('L', 'Sand', 20), v('XL', 'Sand', 2)],
    },
    {
      sku: 'MEN-SHT-003',
      categorySlug: 'men-shirts',
      nameEn: 'Flannel Check Shirt',
      nameAr: 'قميص فانيلا كاروهات',
      descriptionEn: 'Brushed flannel shirt in a classic check pattern.',
      descriptionAr: 'قميص فانيلا مصقول بنقشة كاروهات كلاسيكية.',
      price: 32.0,
      variants: [v('M', 'Red Check', 20), v('L', 'Red Check', 20), v('XL', 'Red Check', 20)],
    },
    {
      sku: 'MEN-SHT-004',
      categorySlug: 'men-shirts',
      nameEn: 'Oxford Button-Down',
      nameAr: 'قميص أكسفورد بأزرار',
      descriptionEn: 'Structured Oxford weave shirt with button-down collar.',
      descriptionAr: 'قميص بنسيج أكسفورد وياقة بأزرار.',
      price: 42.0,
      compareAtPrice: 52.0,
      variants: [v('M', 'White', 20, 42), v('L', 'White', 1, 44), v('XL', 'White', 0, 44)],
    },
    {
      sku: 'MEN-SHT-005',
      categorySlug: 'men-shirts',
      nameEn: 'Denim Shirt',
      nameAr: 'قميص جينز',
      descriptionEn: 'Mid-weight denim shirt, button chest pockets.',
      descriptionAr: 'قميص جينز متوسط الوزن بجيوب صدرية بأزرار.',
      price: 45.0,
      saleType: 'AMOUNT',
      saleValue: 10,
      variants: [v('M', 'Denim Blue', 6), v('L', 'Denim Blue', 20), v('XL', 'Denim Blue', 20)],
    },
    {
      sku: 'MEN-SHT-006',
      categorySlug: 'men-shirts',
      nameEn: 'Chambray Shirt',
      nameAr: 'قميص شامبراي',
      descriptionEn: 'Light chambray shirt with a soft, worn-in feel.',
      descriptionAr: 'قميص شامبراي خفيف بملمس ناعم يشبه القماش القديم.',
      price: 37.0,
      compareAtPrice: 45.0,
      variants: [v('M', 'Indigo', 20), v('L', 'Indigo', 20), v('XL', 'Indigo', 3)],
    },
    {
      sku: 'MEN-SHT-007',
      categorySlug: 'men-shirts',
      nameEn: 'Striped Dress Shirt',
      nameAr: 'قميص رسمي مقلم',
      descriptionEn: 'Slim-fit striped dress shirt for the office.',
      descriptionAr: 'قميص رسمي مقلم بقصة ضيقة مناسب للعمل.',
      price: 40.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('M', 'Blue Stripe', 20), v('L', 'Blue Stripe', 20), v('XL', 'Blue Stripe', 0)],
    },
    {
      sku: 'MEN-SHT-008',
      categorySlug: 'men-shirts',
      nameEn: 'Corduroy Shirt',
      nameAr: 'قميص قطيفة مضلعة',
      descriptionEn: 'Fine-wale corduroy shirt, button-down collar.',
      descriptionAr: 'قميص من القطيفة المضلعة الرفيعة بياقة أزرار.',
      price: 43.0,
      variants: [v('M', 'Olive', 9), v('L', 'Olive', 20), v('XL', 'Olive', 20)],
    },
    {
      sku: 'MEN-SHT-009',
      categorySlug: 'men-shirts',
      nameEn: 'Short-Sleeve Camp Collar Shirt',
      nameAr: 'قميص كامب كولار قصير الأكمام',
      descriptionEn: 'Relaxed camp-collar shirt for warm weather.',
      descriptionAr: 'قميص كامب كولار مريح بأكمام قصيرة للطقس الحار.',
      price: 33.0,
      compareAtPrice: 39.0,
      variants: [v('M', 'Palm Print', 20), v('L', 'Palm Print', 5), v('XL', 'Palm Print', 20)],
    },
    {
      sku: 'MEN-SHT-010',
      categorySlug: 'men-shirts',
      nameEn: 'Twill Work Shirt',
      nameAr: 'قميص تويل عملي',
      descriptionEn: 'Durable cotton twill work shirt with chest pockets.',
      descriptionAr: 'قميص تويل قطني متين بجيوب صدرية.',
      price: 36.0,
      variants: [v('M', 'Khaki', 20), v('L', 'Khaki', 20), v('XL', 'Khaki', 6)],
    },
    {
      sku: 'MEN-SHT-011',
      categorySlug: 'men-shirts',
      nameEn: 'Poplin Dress Shirt',
      nameAr: 'قميص بوبلين رسمي',
      descriptionEn: 'Crisp cotton poplin dress shirt, regular fit.',
      descriptionAr: 'قميص بوبلين قطني أنيق بقصة عادية.',
      price: 41.0,
      saleType: 'AMOUNT',
      saleValue: 8,
      variants: [v('M', 'White', 20, 41), v('L', 'White', 20, 41), v('XL', 'White', 0, 43)],
    },
    {
      sku: 'MEN-SHT-012',
      categorySlug: 'men-shirts',
      nameEn: 'Waffle Henley',
      nameAr: 'هينلي وافل',
      descriptionEn: 'Long-sleeve waffle-knit henley with a button placket.',
      descriptionAr: 'هينلي بنسيج وافل وأكمام طويلة وأزرار أمامية.',
      price: 28.0,
      variants: [v('M', 'Heather Grey', 20), v('L', 'Heather Grey', 20), v('XL', 'Heather Grey', 20)],
    },
    {
      sku: 'MEN-SHT-013',
      categorySlug: 'men-shirts',
      nameEn: 'Seersucker Shirt',
      nameAr: 'قميص سيرساكر',
      descriptionEn: 'Breathable seersucker shirt, classic summer stripe.',
      descriptionAr: 'قميص سيرساكر قابل للتنفس بخطوط صيفية كلاسيكية.',
      price: 39.0,
      compareAtPrice: 47.0,
      variants: [v('M', 'Blue Stripe', 6), v('L', 'Blue Stripe', 20), v('XL', 'Blue Stripe', 20)],
    },
    {
      sku: 'MEN-SHT-014',
      categorySlug: 'men-shirts',
      nameEn: 'Plaid Flannel Overshirt',
      nameAr: 'قميص فانيلا كاروهات خارجي',
      descriptionEn: 'Heavyweight flannel overshirt, wear open or buttoned.',
      descriptionAr: 'قميص فانيلا ثقيل يمكن ارتداؤه مفتوحًا أو بأزرار.',
      price: 46.0,
      saleType: 'PERCENT',
      saleValue: 20,
      variants: [v('M', 'Grey Check', 20), v('L', 'Grey Check', 20), v('XL', 'Grey Check', 2)],
    },
    {
      sku: 'MEN-SHT-015',
      categorySlug: 'men-shirts',
      nameEn: 'Guayabera Shirt',
      nameAr: 'قميص غوايابيرا',
      descriptionEn: 'Traditional guayabera shirt with pintuck pleats.',
      descriptionAr: 'قميص غوايابيرا تقليدي بطيات دقيقة.',
      price: 35.0,
      variants: [v('M', 'White', 20), v('L', 'White', 0), v('XL', 'White', 20)],
    },
    {
      sku: 'MEN-SHT-016',
      categorySlug: 'men-shirts',
      nameEn: 'Performance Stretch Shirt',
      nameAr: 'قميص مرن بأداء عالي',
      descriptionEn: 'Wrinkle-resistant stretch shirt for travel and work.',
      descriptionAr: 'قميص مرن مقاوم للتجعد مناسب للسفر والعمل.',
      price: 44.0,
      compareAtPrice: 54.0,
      variants: [v('M', 'Navy', 20, 44), v('L', 'Navy', 1, 44), v('XL', 'Navy', 20, 46)],
    },
    {
      sku: 'MEN-SHT-017',
      categorySlug: 'men-shirts',
      nameEn: 'Chino Shirt Jacket',
      nameAr: 'جاكيت قميص تشينو',
      descriptionEn: 'Mid-weight chino shirt jacket, snap-button front.',
      descriptionAr: 'جاكيت قميص تشينو متوسط الوزن بأزرار كبس أمامية.',
      price: 52.0,
      saleType: 'AMOUNT',
      saleValue: 12,
      variants: [v('M', 'Stone', 20), v('L', 'Stone', 20), v('XL', 'Stone', 20)],
    },
    {
      sku: 'MEN-SHT-018',
      categorySlug: 'men-shirts',
      nameEn: 'Printed Resort Shirt',
      nameAr: 'قميص منتجع مطبوع',
      descriptionEn: 'Rayon resort shirt with an all-over tropical print.',
      descriptionAr: 'قميص منتجع من الرايون بطبعة استوائية كاملة.',
      price: 34.0,
      variants: [v('M', 'Tropical Print', 20), v('L', 'Tropical Print', 20), v('XL', 'Tropical Print', 4)],
    },
    {
      sku: 'MEN-SHT-019',
      categorySlug: 'men-shirts',
      nameEn: 'Grandad Collar Shirt',
      nameAr: 'قميص بدون ياقة',
      descriptionEn: 'Collarless grandad-style shirt, button placket.',
      descriptionAr: 'قميص بدون ياقة بطراز كلاسيكي وأزرار أمامية.',
      price: 32.0,
      compareAtPrice: 38.0,
      variants: [v('M', 'White', 20), v('L', 'White', 20), v('XL', 'White', 0)],
    },
    {
      sku: 'MEN-SHT-020',
      categorySlug: 'men-shirts',
      nameEn: 'Twill Button-Down',
      nameAr: 'قميص تويل بأزرار',
      descriptionEn: 'Everyday cotton twill button-down, tailored fit.',
      descriptionAr: 'قميص تويل قطني يومي بأزرار وقصة مضبوطة.',
      price: 38.0,
      saleType: 'PERCENT',
      saleValue: 10,
      variants: [v('M', 'Forest Green', 9), v('L', 'Forest Green', 20), v('XL', 'Forest Green', 20)],
    },

    // ---- Men / Underwear ----
    {
      sku: 'MEN-UND-001',
      categorySlug: 'men-underwear',
      nameEn: 'Cotton Boxer 3-Pack',
      nameAr: 'بوكسر قطني - عبوة ٣ قطع',
      descriptionEn: 'Everyday cotton boxers, pack of 3.',
      descriptionAr: 'بوكسر قطني للاستخدام اليومي، عبوة من ٣ قطع.',
      price: 24.0,
      variants: [v('M', 'Assorted', 20), v('L', 'Assorted', 20), v('XL', 'Assorted', 3)],
    },
    {
      sku: 'MEN-UND-002',
      categorySlug: 'men-underwear',
      nameEn: 'Athletic Trunk 3-Pack',
      nameAr: 'ترانك رياضي - عبوة ٣ قطع',
      descriptionEn: 'Moisture-wicking athletic trunks, pack of 3.',
      descriptionAr: 'ترانك رياضي ماص للعرق، عبوة من ٣ قطع.',
      price: 27.0,
      compareAtPrice: 32.0,
      variants: [v('S', 'Black', 20), v('M', 'Black', 20), v('L', 'Black', 0), v('XL', 'Black', 5)],
    },
    {
      sku: 'MEN-UND-003',
      categorySlug: 'men-underwear',
      nameEn: 'Thermal Long Johns',
      nameAr: 'لباس حراري طويل',
      descriptionEn: 'Fleece-lined thermal base layer for cold weather.',
      descriptionAr: 'لباس حراري داخلي مبطن بالفليس للطقس البارد.',
      price: 30.0,
      variants: [v('M', 'Grey', 20), v('L', 'Grey', 20), v('XL', 'Grey', 20)],
    },
    {
      sku: 'MEN-UND-004',
      categorySlug: 'men-underwear',
      nameEn: 'Cotton Undershirt 3-Pack',
      nameAr: 'فانلة قطنية - عبوة ٣ قطع',
      descriptionEn: 'Crew-neck cotton undershirts, pack of 3.',
      descriptionAr: 'فانلة قطنية برقبة دائرية، عبوة من ٣ قطع.',
      price: 21.0,
      saleType: 'PERCENT',
      saleValue: 10,
      variants: [v('S', 'White', 4), v('M', 'White', 20), v('L', 'White', 20), v('XL', 'White', 0)],
    },
    {
      sku: 'MEN-UND-005',
      categorySlug: 'men-underwear',
      nameEn: 'Boxer Brief 2-Pack',
      nameAr: 'بوكسر بريف - عبوة قطعتين',
      descriptionEn: 'Stretch cotton boxer briefs, pack of 2.',
      descriptionAr: 'بوكسر بريف قطني قابل للتمدد، عبوة من قطعتين.',
      price: 19.0,
      variants: [v('M', 'Navy', 20), v('L', 'Navy', 20), v('XL', 'Navy', 2)],
    },
    {
      sku: 'MEN-UND-006',
      categorySlug: 'men-underwear',
      nameEn: 'Modal Boxer 3-Pack',
      nameAr: 'بوكسر مودال - عبوة ٣ قطع',
      descriptionEn: 'Ultra-soft modal boxers, pack of 3.',
      descriptionAr: 'بوكسر من قماش المودال الناعم جدًا، عبوة من ٣ قطع.',
      price: 28.0,
      compareAtPrice: 34.0,
      variants: [v('M', 'Assorted', 20), v('L', 'Assorted', 20), v('XL', 'Assorted', 0)],
    },
    {
      sku: 'MEN-UND-007',
      categorySlug: 'men-underwear',
      nameEn: 'Bamboo Trunk 2-Pack',
      nameAr: 'ترانك بامبو - عبوة قطعتين',
      descriptionEn: 'Breathable bamboo-blend trunks, pack of 2.',
      descriptionAr: 'ترانك من مزيج البامبو القابل للتنفس، عبوة من قطعتين.',
      price: 26.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('S', 'Black', 20), v('M', 'Black', 20), v('L', 'Black', 5)],
    },
    {
      sku: 'MEN-UND-008',
      categorySlug: 'men-underwear',
      nameEn: 'Cotton Brief 3-Pack',
      nameAr: 'شورت قطني - عبوة ٣ قطع',
      descriptionEn: 'Classic cotton briefs, pack of 3.',
      descriptionAr: 'شورت قطني كلاسيكي، عبوة من ٣ قطع.',
      price: 20.0,
      variants: [v('M', 'White', 20), v('L', 'White', 20), v('XL', 'White', 20)],
    },
    {
      sku: 'MEN-UND-009',
      categorySlug: 'men-underwear',
      nameEn: 'Compression Boxer Brief',
      nameAr: 'بوكسر بريف ضاغط',
      descriptionEn: 'Athletic compression boxer brief for high-intensity wear.',
      descriptionAr: 'بوكسر بريف ضاغط رياضي مناسب للأنشطة عالية الشدة.',
      price: 24.0,
      compareAtPrice: 29.0,
      variants: [v('S', 'Black', 5), v('M', 'Black', 20), v('L', 'Black', 20)],
    },
    {
      sku: 'MEN-UND-010',
      categorySlug: 'men-underwear',
      nameEn: 'Silk Boxer',
      nameAr: 'بوكسر حرير',
      descriptionEn: 'Luxe silk boxer shorts, relaxed fit.',
      descriptionAr: 'بوكسر من الحرير الفاخر بقصة مريحة.',
      price: 32.0,
      variants: [v('M', 'Navy', 20), v('L', 'Navy', 3), v('XL', 'Navy', 20)],
    },
    {
      sku: 'MEN-UND-011',
      categorySlug: 'men-underwear',
      nameEn: 'Seamless Trunk 3-Pack',
      nameAr: 'ترانك بلا خياطة - عبوة ٣ قطع',
      descriptionEn: 'Seamless stretch trunks, pack of 3.',
      descriptionAr: 'ترانك قابل للتمدد بلا خياطة، عبوة من ٣ قطع.',
      price: 30.0,
      saleType: 'AMOUNT',
      saleValue: 6,
      variants: [v('M', 'Assorted', 20), v('L', 'Assorted', 20), v('XL', 'Assorted', 6)],
    },
    {
      sku: 'MEN-UND-012',
      categorySlug: 'men-underwear',
      nameEn: 'Long John Bottoms',
      nameAr: 'بنطلون حراري طويل',
      descriptionEn: 'Fleece-lined long john bottoms for winter layering.',
      descriptionAr: 'بنطلون حراري مبطن بالفليس للطبقات الشتوية.',
      price: 27.0,
      variants: [v('M', 'Charcoal', 20), v('L', 'Charcoal', 20), v('XL', 'Charcoal', 0)],
    },
    {
      sku: 'MEN-UND-013',
      categorySlug: 'men-underwear',
      nameEn: 'Cotton Tank 2-Pack',
      nameAr: 'فانلة قطنية بدون أكمام - عبوة قطعتين',
      descriptionEn: 'Ribbed cotton tank undershirts, pack of 2.',
      descriptionAr: 'فانلة قطنية مضلعة بدون أكمام، عبوة من قطعتين.',
      price: 18.0,
      compareAtPrice: 22.0,
      variants: [v('S', 'White', 4), v('M', 'White', 20), v('L', 'White', 20)],
    },
    {
      sku: 'MEN-UND-014',
      categorySlug: 'men-underwear',
      nameEn: 'Mesh Athletic Boxer',
      nameAr: 'بوكسر رياضي شبك',
      descriptionEn: 'Ventilated mesh boxer for workouts.',
      descriptionAr: 'بوكسر رياضي بشبك تهوية للتمارين.',
      price: 22.0,
      saleType: 'PERCENT',
      saleValue: 10,
      variants: [v('M', 'Grey', 20), v('L', 'Grey', 20), v('XL', 'Grey', 20)],
    },
    {
      sku: 'MEN-UND-015',
      categorySlug: 'men-underwear',
      nameEn: 'Waffle Knit Undershirt',
      nameAr: 'فانلة وافل داخلية',
      descriptionEn: 'Textured waffle-knit crew neck undershirt.',
      descriptionAr: 'فانلة داخلية برقبة دائرية ونسيج وافل.',
      price: 19.0,
      variants: [v('M', 'White', 20), v('L', 'White', 1), v('XL', 'White', 20)],
    },
    {
      sku: 'MEN-UND-016',
      categorySlug: 'men-underwear',
      nameEn: 'Bamboo Boxer Brief 3-Pack',
      nameAr: 'بوكسر بريف بامبو - عبوة ٣ قطع',
      descriptionEn: 'Soft bamboo-blend boxer briefs, pack of 3.',
      descriptionAr: 'بوكسر بريف من مزيج البامبو الناعم، عبوة من ٣ قطع.',
      price: 31.0,
      compareAtPrice: 38.0,
      variants: [v('S', 'Assorted', 20), v('M', 'Assorted', 20), v('L', 'Assorted', 20), v('XL', 'Assorted', 7)],
    },
    {
      sku: 'MEN-UND-017',
      categorySlug: 'men-underwear',
      nameEn: 'Classic Brief 3-Pack',
      nameAr: 'شورت كلاسيكي - عبوة ٣ قطع',
      descriptionEn: 'No-frills cotton briefs, pack of 3.',
      descriptionAr: 'شورت قطني بسيط، عبوة من ٣ قطع.',
      price: 21.0,
      variants: [v('M', 'Assorted', 20), v('L', 'Assorted', 20), v('XL', 'Assorted', 20)],
    },
    {
      sku: 'MEN-UND-018',
      categorySlug: 'men-underwear',
      nameEn: 'Stretch Trunk 2-Pack',
      nameAr: 'ترانك مرن - عبوة قطعتين',
      descriptionEn: 'Cotton-stretch trunks, pack of 2.',
      descriptionAr: 'ترانك من القطن المرن، عبوة من قطعتين.',
      price: 23.0,
      saleType: 'AMOUNT',
      saleValue: 5,
      variants: [v('S', 'Black', 20), v('M', 'Black', 20), v('L', 'Black', 0)],
    },
    {
      sku: 'MEN-UND-019',
      categorySlug: 'men-underwear',
      nameEn: 'Merino Thermal Top',
      nameAr: 'قميص حراري مرينو',
      descriptionEn: 'Merino wool thermal base-layer top.',
      descriptionAr: 'قميص حراري داخلي من صوف المرينو.',
      price: 34.0,
      compareAtPrice: 42.0,
      variants: [v('M', 'Grey', 9), v('L', 'Grey', 20), v('XL', 'Grey', 20)],
    },
    {
      sku: 'MEN-UND-020',
      categorySlug: 'men-underwear',
      nameEn: 'Cotton Boxer Brief 2-Pack',
      nameAr: 'بوكسر بريف قطني - عبوة قطعتين',
      descriptionEn: 'Everyday cotton boxer briefs, pack of 2.',
      descriptionAr: 'بوكسر بريف قطني للاستخدام اليومي، عبوة من قطعتين.',
      price: 20.0,
      saleType: 'PERCENT',
      saleValue: 12,
      variants: [v('M', 'Navy', 20), v('L', 'Navy', 20), v('XL', 'Navy', 5)],
    },

    // ---- Kids / Pajamas ----
    {
      sku: 'KID-PJM-001',
      categorySlug: 'kids-pajamas',
      nameEn: 'Dino Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة ديناصور',
      descriptionEn: 'Soft cotton pajama set with dinosaur print, top + bottom.',
      descriptionAr: 'طقم بيجاما قطني ناعم بطبعة ديناصور، علوي وسفلي.',
      price: 18.0,
      compareAtPrice: 22.0,
      variants: [v('2-3Y', 'Green', 20), v('4-5Y', 'Green', 20), v('6-7Y', 'Green', 0), v('4-5Y', 'Blue', 5)],
    },
    {
      sku: 'KID-PJM-002',
      categorySlug: 'kids-pajamas',
      nameEn: 'Unicorn Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة يونيكورن',
      descriptionEn: 'Cotton pajama set with glow-in-the-dark unicorn print.',
      descriptionAr: 'طقم بيجاما قطني بطبعة يونيكورن مضيئة في الظلام.',
      price: 19.0,
      saleType: 'PERCENT',
      saleValue: 20,
      variants: [v('2-3Y', 'Pink', 20), v('4-5Y', 'Pink', 20), v('6-7Y', 'Pink', 3)],
    },
    {
      sku: 'KID-PJM-003',
      categorySlug: 'kids-pajamas',
      nameEn: 'Fleece Onesie',
      nameAr: 'بيجاما فليس قطعة واحدة',
      descriptionEn: 'Cozy one-piece fleece pajama with foot straps.',
      descriptionAr: 'بيجاما فليس دافئة قطعة واحدة مع أشرطة للقدم.',
      price: 21.0,
      variants: [v('2-3Y', 'Grey', 20), v('4-5Y', 'Grey', 20)],
    },
    {
      sku: 'KID-PJM-004',
      categorySlug: 'kids-pajamas',
      nameEn: 'Space Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة فضائية',
      descriptionEn: 'Glow-in-the-dark space print pajama top + shorts set.',
      descriptionAr: 'طقم بيجاما (علوي وشورت) بطبعة فضائية مضيئة في الظلام.',
      price: 17.0,
      compareAtPrice: 20.0,
      variants: [v('4-5Y', 'Navy', 20), v('6-7Y', 'Navy', 0), v('8-9Y', 'Navy', 6)],
    },
    {
      sku: 'KID-PJM-005',
      categorySlug: 'kids-pajamas',
      nameEn: 'Cotton Nightgown',
      nameAr: 'قميص نوم قطني للأطفال',
      descriptionEn: "Soft cotton nightgown for girls, floral print.",
      descriptionAr: 'قميص نوم قطني ناعم للبنات بطبعة زهور.',
      price: 16.0,
      variants: [v('2-3Y', 'Floral', 20), v('4-5Y', 'Floral', 1), v('6-7Y', 'Floral', 20)],
    },
    {
      sku: 'KID-PJM-006',
      categorySlug: 'kids-pajamas',
      nameEn: 'Shark Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة سمك القرش',
      descriptionEn: 'Cotton pajama set with a shark print, top + bottom.',
      descriptionAr: 'طقم بيجاما قطني بطبعة سمك القرش، علوي وسفلي.',
      price: 19.0,
      compareAtPrice: 23.0,
      variants: [v('2-3Y', 'Blue', 20), v('4-5Y', 'Blue', 20), v('6-7Y', 'Blue', 0)],
    },
    {
      sku: 'KID-PJM-007',
      categorySlug: 'kids-pajamas',
      nameEn: 'Rainbow Print Nightgown',
      nameAr: 'قميص نوم بطبعة قوس قزح',
      descriptionEn: 'Soft nightgown with a bright rainbow print.',
      descriptionAr: 'قميص نوم ناعم بطبعة قوس قزح زاهية.',
      price: 17.0,
      saleType: 'PERCENT',
      saleValue: 20,
      variants: [v('2-3Y', 'Multi', 20), v('4-5Y', 'Multi', 20), v('6-7Y', 'Multi', 3)],
    },
    {
      sku: 'KID-PJM-008',
      categorySlug: 'kids-pajamas',
      nameEn: 'Camo Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة كامو',
      descriptionEn: 'Cotton pajama set with a camo print, top + bottom.',
      descriptionAr: 'طقم بيجاما قطني بطبعة كامو، علوي وسفلي.',
      price: 18.0,
      variants: [v('4-5Y', 'Green', 20), v('6-7Y', 'Green', 20), v('8-9Y', 'Green', 4)],
    },
    {
      sku: 'KID-PJM-009',
      categorySlug: 'kids-pajamas',
      nameEn: 'Fleece Footed Pajama',
      nameAr: 'بيجاما فليس بأقدام',
      descriptionEn: 'Warm one-piece footed pajama for toddlers.',
      descriptionAr: 'بيجاما فليس دافئة قطعة واحدة بأقدام للأطفال الصغار.',
      price: 22.0,
      compareAtPrice: 26.0,
      variants: [v('2-3Y', 'Grey', 20), v('4-5Y', 'Grey', 6)],
    },
    {
      sku: 'KID-PJM-010',
      categorySlug: 'kids-pajamas',
      nameEn: 'Robot Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة روبوت',
      descriptionEn: 'Glow-in-the-dark robot print pajama set.',
      descriptionAr: 'طقم بيجاما بطبعة روبوت مضيئة في الظلام.',
      price: 20.0,
      saleType: 'AMOUNT',
      saleValue: 4,
      variants: [v('4-5Y', 'Navy', 20), v('6-7Y', 'Navy', 20), v('8-9Y', 'Navy', 0)],
    },
    {
      sku: 'KID-PJM-011',
      categorySlug: 'kids-pajamas',
      nameEn: 'Butterfly Print Nightgown',
      nameAr: 'قميص نوم بطبعة فراشات',
      descriptionEn: 'Lightweight nightgown with a butterfly print.',
      descriptionAr: 'قميص نوم خفيف بطبعة فراشات.',
      price: 16.0,
      variants: [v('2-3Y', 'Pink', 20), v('4-5Y', 'Pink', 20), v('6-7Y', 'Pink', 20)],
    },
    {
      sku: 'KID-PJM-012',
      categorySlug: 'kids-pajamas',
      nameEn: 'Race Car Pajama Set',
      nameAr: 'طقم بيجاما بطبعة سيارات سباق',
      descriptionEn: 'Cotton pajama set with a race car print.',
      descriptionAr: 'طقم بيجاما قطني بطبعة سيارات سباق.',
      price: 18.0,
      compareAtPrice: 21.0,
      variants: [v('2-3Y', 'Red', 20), v('4-5Y', 'Red', 1), v('6-7Y', 'Red', 20)],
    },
    {
      sku: 'KID-PJM-013',
      categorySlug: 'kids-pajamas',
      nameEn: 'Bunny Fleece Onesie',
      nameAr: 'بيجاما فليس بطبعة أرنب',
      descriptionEn: 'Cozy fleece onesie with a bunny-ears hood.',
      descriptionAr: 'بيجاما فليس دافئة بقلنسوة على شكل أذني أرنب.',
      price: 24.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('2-3Y', 'White', 20), v('4-5Y', 'White', 20)],
    },
    {
      sku: 'KID-PJM-014',
      categorySlug: 'kids-pajamas',
      nameEn: 'Star Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة نجوم',
      descriptionEn: 'Glow-in-the-dark star print pajama set.',
      descriptionAr: 'طقم بيجاما بطبعة نجوم مضيئة في الظلام.',
      price: 19.0,
      variants: [v('4-5Y', 'Navy', 20), v('6-7Y', 'Navy', 20), v('8-9Y', 'Navy', 5)],
    },
    {
      sku: 'KID-PJM-015',
      categorySlug: 'kids-pajamas',
      nameEn: 'Mermaid Print Nightgown',
      nameAr: 'قميص نوم بطبعة حورية بحر',
      descriptionEn: 'Sequin-free mermaid print nightgown.',
      descriptionAr: 'قميص نوم بطبعة حورية بحر بدون ترتر.',
      price: 17.0,
      compareAtPrice: 20.0,
      variants: [v('2-3Y', 'Teal', 20), v('4-5Y', 'Teal', 0), v('6-7Y', 'Teal', 20)],
    },
    {
      sku: 'KID-PJM-016',
      categorySlug: 'kids-pajamas',
      nameEn: 'Truck Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة شاحنات',
      descriptionEn: 'Cotton pajama set with a truck print, top + bottom.',
      descriptionAr: 'طقم بيجاما قطني بطبعة شاحنات، علوي وسفلي.',
      price: 18.0,
      saleType: 'AMOUNT',
      saleValue: 5,
      variants: [v('2-3Y', 'Yellow', 20), v('4-5Y', 'Yellow', 20), v('6-7Y', 'Yellow', 3)],
    },
    {
      sku: 'KID-PJM-017',
      categorySlug: 'kids-pajamas',
      nameEn: 'Cloud Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة غيوم',
      descriptionEn: 'Soft cotton pajama set with a cloud print.',
      descriptionAr: 'طقم بيجاما قطني ناعم بطبعة غيوم.',
      price: 17.0,
      variants: [v('2-3Y', 'Sky Blue', 20), v('4-5Y', 'Sky Blue', 20), v('6-7Y', 'Sky Blue', 20)],
    },
    {
      sku: 'KID-PJM-018',
      categorySlug: 'kids-pajamas',
      nameEn: 'Dragon Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة تنين',
      descriptionEn: 'Glow-in-the-dark dragon print pajama set.',
      descriptionAr: 'طقم بيجاما بطبعة تنين مضيئة في الظلام.',
      price: 20.0,
      compareAtPrice: 24.0,
      variants: [v('4-5Y', 'Green', 9), v('6-7Y', 'Green', 20), v('8-9Y', 'Green', 20)],
    },
    {
      sku: 'KID-PJM-019',
      categorySlug: 'kids-pajamas',
      nameEn: 'Puppy Print Nightgown',
      nameAr: 'قميص نوم بطبعة جراء',
      descriptionEn: 'Fleece nightgown with a puppy print.',
      descriptionAr: 'قميص نوم فليس بطبعة جراء.',
      price: 18.0,
      saleType: 'PERCENT',
      saleValue: 10,
      variants: [v('2-3Y', 'Beige', 20), v('4-5Y', 'Beige', 20), v('6-7Y', 'Beige', 0)],
    },
    {
      sku: 'KID-PJM-020',
      categorySlug: 'kids-pajamas',
      nameEn: 'Superhero Pajama Set',
      nameAr: 'طقم بيجاما أبطال خارقين',
      descriptionEn: 'Cotton pajama set with a superhero print, top + bottom.',
      descriptionAr: 'طقم بيجاما قطني بطبعة أبطال خارقين، علوي وسفلي.',
      price: 19.0,
      variants: [v('4-5Y', 'Red', 20), v('6-7Y', 'Red', 20), v('8-9Y', 'Red', 6)],
    },

    // ---- Kids / Everyday ----
    {
      sku: 'KID-EVR-001',
      categorySlug: 'kids-everyday',
      nameEn: 'Everyday Cotton T-Shirt',
      nameAr: 'تيشيرت قطني يومي',
      descriptionEn: 'Comfortable everyday cotton t-shirt for kids.',
      descriptionAr: 'تيشيرت قطني مريح للاستخدام اليومي للأطفال.',
      price: 12.0,
      variants: [v('2-3Y', 'Yellow', 0), v('4-5Y', 'Yellow', 20), v('4-5Y', 'White', 0)],
    },
    {
      sku: 'KID-EVR-002',
      categorySlug: 'kids-everyday',
      nameEn: 'Jogger Pants',
      nameAr: 'بنطلون جوغر',
      descriptionEn: 'Stretch cotton jogger pants with elastic cuffs.',
      descriptionAr: 'بنطلون جوغر قطني قابل للتمدد بأطراف مطاطية.',
      price: 15.0,
      compareAtPrice: 18.0,
      variants: [v('2-3Y', 'Grey', 20), v('4-5Y', 'Grey', 4), v('6-7Y', 'Grey', 20)],
    },
    {
      sku: 'KID-EVR-003',
      categorySlug: 'kids-everyday',
      nameEn: 'Zip-Up Hoodie',
      nameAr: 'هودي بسحاب',
      descriptionEn: 'Fleece-lined zip-up hoodie with kangaroo pocket.',
      descriptionAr: 'هودي بسحاب ومبطن بالفليس مع جيب أمامي.',
      price: 23.0,
      saleType: 'AMOUNT',
      saleValue: 5,
      variants: [v('4-5Y', 'Navy', 20), v('6-7Y', 'Navy', 20), v('8-9Y', 'Navy', 0)],
    },
    {
      sku: 'KID-EVR-004',
      categorySlug: 'kids-everyday',
      nameEn: 'Denim Overalls',
      nameAr: 'أوفرول جينز',
      descriptionEn: 'Classic denim overalls with adjustable straps.',
      descriptionAr: 'أوفرول جينز كلاسيكي بحمالات قابلة للتعديل.',
      price: 26.0,
      variants: [v('2-3Y', 'Denim Blue', 20), v('4-5Y', 'Denim Blue', 2)],
    },
    {
      sku: 'KID-EVR-005',
      categorySlug: 'kids-everyday',
      nameEn: 'Graphic Tee 2-Pack',
      nameAr: 'تيشيرت مطبوع - عبوة قطعتين',
      descriptionEn: 'Two graphic-print cotton t-shirts in one pack.',
      descriptionAr: 'قطعتا تيشيرت قطني مطبوع في عبوة واحدة.',
      price: 14.0,
      compareAtPrice: 17.0,
      variants: [v('4-5Y', 'Assorted', 20), v('6-7Y', 'Assorted', 20), v('8-9Y', 'Assorted', 5)],
    },
    {
      sku: 'KID-EVR-006',
      categorySlug: 'kids-everyday',
      nameEn: 'Striped Long-Sleeve Tee',
      nameAr: 'تيشيرت مقلم بأكمام طويلة',
      descriptionEn: 'Soft cotton long-sleeve tee with stripes.',
      descriptionAr: 'تيشيرت قطني ناعم بأكمام طويلة وخطوط.',
      price: 13.0,
      compareAtPrice: 16.0,
      variants: [v('2-3Y', 'Navy Stripe', 20), v('4-5Y', 'Navy Stripe', 20), v('6-7Y', 'Navy Stripe', 0)],
    },
    {
      sku: 'KID-EVR-007',
      categorySlug: 'kids-everyday',
      nameEn: 'Cargo Shorts',
      nameAr: 'شورت كارجو',
      descriptionEn: 'Durable cotton cargo shorts with side pockets.',
      descriptionAr: 'شورت قطني متين بجيوب جانبية.',
      price: 16.0,
      variants: [v('4-5Y', 'Khaki', 20), v('6-7Y', 'Khaki', 20), v('8-9Y', 'Khaki', 4)],
    },
    {
      sku: 'KID-EVR-008',
      categorySlug: 'kids-everyday',
      nameEn: 'Corduroy Overalls',
      nameAr: 'أوفرول قطيفة مضلعة',
      descriptionEn: 'Soft corduroy overalls with adjustable straps.',
      descriptionAr: 'أوفرول من القطيفة المضلعة الناعمة بحمالات قابلة للتعديل.',
      price: 28.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('2-3Y', 'Mustard', 20), v('4-5Y', 'Mustard', 3)],
    },
    {
      sku: 'KID-EVR-009',
      categorySlug: 'kids-everyday',
      nameEn: 'Fleece Sweatpants',
      nameAr: 'بنطلون رياضي فليس',
      descriptionEn: 'Warm fleece sweatpants with an elastic waistband.',
      descriptionAr: 'بنطلون رياضي فليس دافئ بحزام مطاطي.',
      price: 15.0,
      compareAtPrice: 18.0,
      variants: [v('2-3Y', 'Grey', 20), v('4-5Y', 'Grey', 20), v('6-7Y', 'Grey', 20)],
    },
    {
      sku: 'KID-EVR-010',
      categorySlug: 'kids-everyday',
      nameEn: 'Polo Shirt 2-Pack',
      nameAr: 'قميص بولو - عبوة قطعتين',
      descriptionEn: 'Cotton pique polo shirts, pack of 2.',
      descriptionAr: 'قميص بولو قطني بيكيه، عبوة من قطعتين.',
      price: 20.0,
      saleType: 'AMOUNT',
      saleValue: 4,
      variants: [v('4-5Y', 'Assorted', 20), v('6-7Y', 'Assorted', 20), v('8-9Y', 'Assorted', 6)],
    },
    {
      sku: 'KID-EVR-011',
      categorySlug: 'kids-everyday',
      nameEn: 'Denim Shorts',
      nameAr: 'شورت جينز',
      descriptionEn: 'Classic denim shorts with an adjustable waist.',
      descriptionAr: 'شورت جينز كلاسيكي بخصر قابل للتعديل.',
      price: 17.0,
      variants: [v('2-3Y', 'Denim Blue', 20), v('4-5Y', 'Denim Blue', 0), v('6-7Y', 'Denim Blue', 20)],
    },
    {
      sku: 'KID-EVR-012',
      categorySlug: 'kids-everyday',
      nameEn: 'Graphic Sweatshirt',
      nameAr: 'سويت شيرت مطبوع',
      descriptionEn: 'Cozy fleece sweatshirt with a graphic print.',
      descriptionAr: 'سويت شيرت فليس دافئ بطبعة مميزة.',
      price: 19.0,
      compareAtPrice: 23.0,
      variants: [v('4-5Y', 'Heather Grey', 20), v('6-7Y', 'Heather Grey', 20), v('8-9Y', 'Heather Grey', 5)],
    },
    {
      sku: 'KID-EVR-013',
      categorySlug: 'kids-everyday',
      nameEn: 'Leggings 2-Pack',
      nameAr: 'ليجنز - عبوة قطعتين',
      descriptionEn: 'Stretch cotton leggings, pack of 2.',
      descriptionAr: 'ليجنز قطني قابل للتمدد، عبوة من قطعتين.',
      price: 16.0,
      variants: [v('2-3Y', 'Assorted', 20), v('4-5Y', 'Assorted', 20), v('6-7Y', 'Assorted', 20)],
    },
    {
      sku: 'KID-EVR-014',
      categorySlug: 'kids-everyday',
      nameEn: 'Flannel Shirt',
      nameAr: 'قميص فانيلا',
      descriptionEn: 'Brushed flannel shirt in a soft check pattern.',
      descriptionAr: 'قميص فانيلا مصقول بنقشة كاروهات ناعمة.',
      price: 21.0,
      saleType: 'PERCENT',
      saleValue: 10,
      variants: [v('4-5Y', 'Red Check', 20), v('6-7Y', 'Red Check', 20), v('8-9Y', 'Red Check', 0)],
    },
    {
      sku: 'KID-EVR-015',
      categorySlug: 'kids-everyday',
      nameEn: 'Cotton Tank 2-Pack',
      nameAr: 'فانلة قطنية - عبوة قطعتين',
      descriptionEn: 'Everyday cotton tank tops, pack of 2.',
      descriptionAr: 'فانلة قطنية للاستخدام اليومي، عبوة من قطعتين.',
      price: 12.0,
      compareAtPrice: 14.0,
      variants: [v('2-3Y', 'Assorted', 20), v('4-5Y', 'Assorted', 20), v('6-7Y', 'Assorted', 3)],
    },
    {
      sku: 'KID-EVR-016',
      categorySlug: 'kids-everyday',
      nameEn: 'Track Pants',
      nameAr: 'بنطلون تراك',
      descriptionEn: 'Lightweight track pants with side stripes.',
      descriptionAr: 'بنطلون تراك خفيف بخطوط جانبية.',
      price: 18.0,
      variants: [v('4-5Y', 'Navy', 20), v('6-7Y', 'Navy', 20), v('8-9Y', 'Navy', 20)],
    },
    {
      sku: 'KID-EVR-017',
      categorySlug: 'kids-everyday',
      nameEn: 'Puffer Vest',
      nameAr: 'صدرية منفوخة',
      descriptionEn: 'Lightweight puffer vest for layering in cooler weather.',
      descriptionAr: 'صدرية منفوخة خفيفة للطبقات في الطقس البارد.',
      price: 25.0,
      saleType: 'AMOUNT',
      saleValue: 5,
      variants: [v('2-3Y', 'Black', 9), v('4-5Y', 'Black', 20), v('6-7Y', 'Black', 20)],
    },
    {
      sku: 'KID-EVR-018',
      categorySlug: 'kids-everyday',
      nameEn: 'Chino Pants',
      nameAr: 'بنطلون تشينو',
      descriptionEn: 'Smart-casual cotton chino pants.',
      descriptionAr: 'بنطلون تشينو قطني كاجوال أنيق.',
      price: 22.0,
      compareAtPrice: 26.0,
      variants: [v('4-5Y', 'Beige', 20), v('6-7Y', 'Beige', 20), v('8-9Y', 'Beige', 0)],
    },
    {
      sku: 'KID-EVR-019',
      categorySlug: 'kids-everyday',
      nameEn: 'Ribbed Bodysuit 3-Pack',
      nameAr: 'بودي سوت مضلع - عبوة ٣ قطع',
      descriptionEn: 'Stretch ribbed bodysuits, pack of 3.',
      descriptionAr: 'بودي سوت مضلع قابل للتمدد، عبوة من ٣ قطع.',
      price: 21.0,
      variants: [v('2-3Y', 'Assorted', 20), v('4-5Y', 'Assorted', 20)],
    },
    {
      sku: 'KID-EVR-020',
      categorySlug: 'kids-everyday',
      nameEn: 'Zip Hoodie Set',
      nameAr: 'طقم هودي بسحاب',
      descriptionEn: 'Zip-up hoodie and jogger pants set.',
      descriptionAr: 'طقم هودي بسحاب وبنطلون جوغر.',
      price: 27.0,
      saleType: 'PERCENT',
      saleValue: 15,
      variants: [v('4-5Y', 'Grey', 20), v('6-7Y', 'Grey', 20), v('8-9Y', 'Grey', 4)],
    },
  ];

  for (const p of productDefs) {
    const category = categories.get(p.categorySlug)!;
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        descriptionEn: p.descriptionEn,
        descriptionAr: p.descriptionAr,
        primaryCategoryID: category.id,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        saleType: p.saleType ?? null,
        saleValue: p.saleValue ?? null,
      },
      create: {
        sku: p.sku,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        descriptionEn: p.descriptionEn,
        descriptionAr: p.descriptionAr,
        primaryCategoryID: category.id,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? undefined,
        saleType: p.saleType,
        saleValue: p.saleValue,
      },
    });

    for (const [i, v] of p.variants.entries()) {
      await prisma.productVariant.upsert({
        where: { sku: `${p.sku}-${i + 1}` },
        update: {
          size: v.size ?? null,
          color: v.color ?? null,
          price: v.price ?? null,
          stockQuantity: v.stockQuantity,
        },
        create: {
          productID: product.id,
          sku: `${p.sku}-${i + 1}`,
          size: v.size,
          color: v.color,
          price: v.price,
          stockQuantity: v.stockQuantity,
        },
      });
    }

    // Photos: one generic shot, then several genuinely different photos per
    // variant colour so the card's hover-to-scrub gallery and the PDP's
    // colour-swap gallery both have real images to move between. Products with
    // no colour variants just get a few generic shots. Deterministic
    // clothing-photo seeds (see `clothImage`), re-created on every run
    // (ProductImage has no natural key to upsert against; drop-and-recreate
    // keeps the seed idempotent).
    const IMAGES_PER_COLOR = 4;
    const GENERIC_IMAGES = 3;
    const colorSlug = (c: string) => c.toLowerCase().replace(/\s+/g, '-');
    const topic = clothTopicFor(p.categorySlug);
    const productColors = [
      ...new Set(p.variants.map((vv) => vv.color).filter((c): c is string => Boolean(c))),
    ];

    await prisma.productImage.deleteMany({ where: { productID: product.id } });
    const images =
      productColors.length > 0
        ? [
            { productID: product.id, url: clothImage(p.sku, topic), altEn: p.nameEn, altAr: p.nameAr, sortOrder: 0 },
            ...productColors.flatMap((color, ci) =>
              Array.from({ length: IMAGES_PER_COLOR }, (_, k) => ({
                productID: product.id,
                url: clothImage(`${p.sku}-${colorSlug(color)}-${k + 1}`, topic),
                altEn: `${p.nameEn} — ${color} (${k + 1})`,
                altAr: `${p.nameAr} — ${color} (${k + 1})`,
                sortOrder: 1 + ci * IMAGES_PER_COLOR + k,
                color,
              }))
            ),
          ]
        : Array.from({ length: GENERIC_IMAGES }, (_, k) => ({
            productID: product.id,
            url: clothImage(k === 0 ? p.sku : `${p.sku}-${k + 1}`, topic),
            altEn: p.nameEn,
            altAr: p.nameAr,
            sortOrder: k,
          }));
    await prisma.productImage.createMany({ data: images });
  }

  // ---- Additional category placements (Stage 1: primary + additional — see
  // ProductCategory) ----
  // A couple of deliberate cross-listings within the same root, so a product
  // with a primary category plus one more additional placement exists in the
  // seed data (not just in tests). Cross-listing across Women/Men would be
  // unrealistic for this gendered-apparel catalog, unlike the architecture
  // doc's unisex-shoe example — a same-branch cross-listing (a lingerie piece
  // also shown under Nightwear, and vice versa) is the realistic analog.
  const crossListings: [sku: string, additionalCategorySlug: string][] = [
    ['WOM-LNG-001', 'women-nightwear'],
    ['WOM-NGT-001', 'women-lingerie'],
  ];
  for (const [sku, categorySlug] of crossListings) {
    const product = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
    const category = categories.get(categorySlug);
    if (product && category) {
      await prisma.productCategory.upsert({
        where: { productID_categoryID: { productID: product.id, categoryID: category.id } },
        update: {},
        create: { productID: product.id, categoryID: category.id },
      });
    }
  }

  // ---- Collections (Stage 1: flat, manual merchandising groups, unrelated
  // to the category tree — see robust-ecommerce-catalog-architecture.md's
  // "core idea") ----
  // Only two, deliberately: Sale and New Arrivals. Women/Men/Kids are
  // Categories now (the permanent navigation tree, above); Collection is
  // reserved for this kind of cross-cutting, hand-picked grouping instead —
  // documented in catalog-redesign-implementation-plan.md's Stage 1 scope,
  // not an implicit side effect of the restructuring. Membership is manual
  // only (Stage 1 has no CollectionRule yet), so the picks below are just a
  // deterministic, reasonable-looking slice of the seeded catalog.
  const sale = await prisma.collection.upsert({
    where: { slug: 'sale' },
    update: { nameEn: 'Sale', nameAr: 'تخفيضات', isActive: true },
    create: { slug: 'sale', nameEn: 'Sale', nameAr: 'تخفيضات' },
  });
  const newArrivals = await prisma.collection.upsert({
    where: { slug: 'new-arrivals' },
    update: { nameEn: 'New Arrivals', nameAr: 'وصل حديثاً', isActive: true },
    create: { slug: 'new-arrivals', nameEn: 'New Arrivals', nameAr: 'وصل حديثاً' },
  });

  const onSaleProducts = await prisma.product.findMany({
    where: { saleType: { not: null } },
    select: { id: true },
    orderBy: { sku: 'asc' },
    take: 12,
  });
  await prisma.collectionProduct.deleteMany({ where: { collectionID: sale.id } });
  await prisma.collectionProduct.createMany({
    data: onSaleProducts.map((p, i) => ({ collectionID: sale.id, productID: p.id, sortOrder: i })),
  });

  const newestProducts = await prisma.product.findMany({
    select: { id: true },
    orderBy: [{ dateCreated: 'desc' }, { sku: 'desc' }],
    take: 12,
  });
  await prisma.collectionProduct.deleteMany({ where: { collectionID: newArrivals.id } });
  await prisma.collectionProduct.createMany({
    data: newestProducts.map((p, i) => ({ collectionID: newArrivals.id, productID: p.id, sortOrder: i })),
  });

  // Site settings singleton (id 1) + the default announcement lines. Idempotent:
  // upsert the row, and only seed the lines when there are none yet so a run
  // doesn't stomp on owner edits.
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

  // Built-in "smart" home rows — the migration creates them switched off
  // (production-safe); this dev seed turns them on and interleaves them with
  // the collections in the shared "Home page order" (women 10, men 20,
  // pajamas 30, kids banner 40).
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
  // Delivery fee: shipped OFF so the storefront behaves as before, but with a
  // sample config (a $3 flat fee, free over $50, cheaper Beirut / Mount Lebanon)
  // so the owner just flips the toggle. Idempotent — only when unset.
  if ((await prisma.deliveryRate.count({ where: { settingID: 1 } })) === 0) {
    await prisma.siteSetting.update({
      where: { id: 1 },
      data: { deliveryFeeFlat: 3, freeDeliveryThreshold: 50 },
    });
    await prisma.deliveryRate.createMany({
      data: [
        { settingID: 1, sortOrder: 0, region: 'BEIRUT', fee: 2 },
        { settingID: 1, sortOrder: 1, region: 'MOUNT_LEBANON', fee: 2.5 },
      ],
    });
  }

  console.log(
    `[seed] done — ${productDefs.length} products across ${rootCategoryDefs.length + subcategoryDefs.length} categories.`
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
