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

/** Deterministic per-product photo — same SKU always resolves to the same
 *  image, so reseeding doesn't reshuffle every product's picture. Real
 *  product photos aren't part of this seed; picsum's `seed` param is just a
 *  stand-in that happens to be stable and free. */
function picsum(seed: string, w = 800, h = 1000): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

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
  /** Colours (matching some of this product's variant colours) that get
   *  their own tagged photo, so the PDP's colour-swap gallery has something
   *  to actually swap between. Omit for the default: two untagged/generic
   *  photos, shown regardless of colour. */
  colorImages?: string[];
}

function v(size: string | undefined, color: string | undefined, stockQuantity: number, price?: number): VariantDef {
  return { size, color, stockQuantity, price };
}

async function main() {
  console.log('[seed] starting…');

  // ---- Admin user ----
  const adminPasswordHash = await argon2.hash(requireSeedAdminPassword());
  await prisma.user.upsert({
    where: { email: 'admin@alistore.com' },
    update: {},
    create: {
      email: 'admin@alistore.com',
      name: "Ali's Store Admin",
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
    },
  });

  // ---- Collections (replace the old Department enum; owner-editable) ----
  // showOnHome demos the home page's featured row: women + men get their own
  // "collection row" (name + horizontal scroll of categories); kids is left
  // out to demo the "rest of the collections" zone below it.
  const collectionDefs = [
    { slug: 'women', nameEn: 'Women', nameAr: 'نساء', sortOrder: 1, showInNav: true, showOnHome: true, accentColor: '#a65a7e' },
    { slug: 'men', nameEn: 'Men', nameAr: 'رجال', sortOrder: 2, showInNav: true, showOnHome: true, accentColor: '#38455c' },
    { slug: 'kids', nameEn: 'Kids', nameAr: 'أطفال', sortOrder: 3, showInNav: true, showOnHome: false, accentColor: '#b4611e' },
  ];

  const collections = new Map<string, { id: string }>();
  for (const c of collectionDefs) {
    const col = await prisma.collection.upsert({
      where: { slug: c.slug },
      update: {
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sortOrder: c.sortOrder,
        showInNav: c.showInNav,
        showOnHome: c.showOnHome,
        accentColor: c.accentColor,
      },
      create: c,
    });
    collections.set(c.slug, { id: col.id });
  }

  // ---- Categories (bilingual, each linked to one collection) ----
  // kids-pajamas is individually featured too, to demo a category getting its
  // own "product row" on the home page independent of its collection.
  const categoryDefs = [
    { collectionSlug: 'women', nameEn: 'Lingerie', nameAr: 'ملابس داخلية نسائية', slug: 'women-lingerie', sortOrder: 1 },
    { collectionSlug: 'women', nameEn: 'Nightwear', nameAr: 'ملابس النوم النسائية', slug: 'women-nightwear', sortOrder: 2 },
    { collectionSlug: 'men', nameEn: "Men's Shirts", nameAr: 'قمصان رجالي', slug: 'men-shirts', sortOrder: 1 },
    { collectionSlug: 'men', nameEn: "Men's Underwear", nameAr: 'ملابس داخلية رجالية', slug: 'men-underwear', sortOrder: 2 },
    { collectionSlug: 'kids', nameEn: "Kids' Pajamas", nameAr: 'بيجامات أطفال', slug: 'kids-pajamas', sortOrder: 4, showOnHome: true },
    { collectionSlug: 'kids', nameEn: "Kids' Everyday", nameAr: 'ملابس أطفال يومية', slug: 'kids-everyday', sortOrder: 2 },
  ];

  const categories = new Map<string, { id: string; collectionID: string }>();
  for (const c of categoryDefs) {
    const collectionID = collections.get(c.collectionSlug)!.id;
    const data = {
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      slug: c.slug,
      collectionID,
      sortOrder: c.sortOrder,
      showOnHome: c.showOnHome ?? false,
    };
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: data,
      create: data,
    });
    categories.set(c.slug, { id: cat.id, collectionID });
  }

  // ---- Products + variants ----
  // 5 per category (30 total) — enough for "You might also like" and the
  // filters/pagination to have real neighbours to work with, instead of one
  // lonely product per category. Deliberately varied per product: some on an
  // active sale (PERCENT or AMOUNT), some just carrying a compareAtPrice with
  // no active sale, some at plain price; stock spans out-of-stock / low
  // (≤5) / healthy across variants; a few variants carry their own price
  // override.
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
      colorImages: ['Black', 'Beige'],
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
      colorImages: ['White', 'Light Blue'],
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
      colorImages: ['Green', 'Blue'],
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
        categoryID: category.id,
        collectionID: category.collectionID,
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
        categoryID: category.id,
        collectionID: category.collectionID,
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

    // Two deterministic photos per product by default (no colour tagging —
    // the gallery-by-colour feature works fine with none tagged, it just
    // falls back to showing every image regardless of colour). A handful of
    // products opt into `colorImages` instead: one generic shot plus one
    // genuinely different tagged photo per listed colour, so the PDP's
    // colour-swap gallery has something real to swap between when testing it
    // manually. Re-created on every seed run rather than upserted:
    // ProductImage has no natural unique key to upsert against, and picsum
    // URLs are stable per seed string anyway, so drop-and-recreate is
    // harmless and keeps this idempotent.
    await prisma.productImage.deleteMany({ where: { productID: product.id } });
    const images = p.colorImages
      ? [
          { productID: product.id, url: picsum(p.sku), altEn: p.nameEn, altAr: p.nameAr, sortOrder: 0 },
          ...p.colorImages.map((color, i) => ({
            productID: product.id,
            url: picsum(`${p.sku}-${color.toLowerCase().replace(/\s+/g, '-')}`),
            altEn: `${p.nameEn} — ${color}`,
            altAr: `${p.nameAr} — ${color}`,
            sortOrder: i + 1,
            color,
          })),
        ]
      : [
          { productID: product.id, url: picsum(p.sku), altEn: p.nameEn, altAr: p.nameAr, sortOrder: 0 },
          { productID: product.id, url: picsum(`${p.sku}-b`), altEn: p.nameEn, altAr: p.nameAr, sortOrder: 1 },
        ];
    await prisma.productImage.createMany({ data: images });
  }

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

  console.log(`[seed] done — ${productDefs.length} products across ${categoryDefs.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
