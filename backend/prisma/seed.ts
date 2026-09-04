import { PrismaClient } from '@prisma/client';
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

  // ---- Products + variants (size/color only) ----
  const productDefs = [
    {
      sku: 'WOM-LNG-001',
      categorySlug: 'women-lingerie',
      nameEn: 'Lace Trim Bralette Set',
      nameAr: 'طقم بروليت بحواف دانتيل',
      descriptionEn: 'Soft lace-trim bralette and matching bottom, everyday comfort fit.',
      descriptionAr: 'طقم بروليت بحواف دانتيل ناعمة مع تحتاني مطابق، مريح للاستخدام اليومي.',
      price: 28.0,
      compareAtPrice: 34.0,
      variants: [
        { size: 'S', color: 'Black' },
        { size: 'M', color: 'Black' },
        { size: 'L', color: 'Black' },
        { size: 'S', color: 'Beige' },
        { size: 'M', color: 'Beige' },
      ],
    },
    {
      sku: 'WOM-NGT-001',
      categorySlug: 'women-nightwear',
      nameEn: 'Satin Nightgown',
      nameAr: 'قميص نوم ساتان',
      descriptionEn: 'Lightweight satin nightgown with adjustable straps.',
      descriptionAr: 'قميص نوم من الساتان الخفيف بحمالات قابلة للتعديل.',
      price: 32.0,
      compareAtPrice: null,
      variants: [
        { size: 'M', color: 'Rose' },
        { size: 'L', color: 'Rose' },
        { size: 'M', color: 'Navy' },
      ],
    },
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
        { size: 'M', color: 'White' },
        { size: 'L', color: 'White' },
        { size: 'XL', color: 'White' },
        { size: 'M', color: 'Light Blue' },
        { size: 'L', color: 'Light Blue' },
      ],
    },
    {
      sku: 'MEN-UND-001',
      categorySlug: 'men-underwear',
      nameEn: 'Cotton Boxer 3-Pack',
      nameAr: 'بوكسر قطني - عبوة ٣ قطع',
      descriptionEn: 'Everyday cotton boxers, pack of 3.',
      descriptionAr: 'بوكسر قطني للاستخدام اليومي، عبوة من ٣ قطع.',
      price: 24.0,
      compareAtPrice: null,
      variants: [
        { size: 'M', color: 'Assorted' },
        { size: 'L', color: 'Assorted' },
        { size: 'XL', color: 'Assorted' },
      ],
    },
    {
      sku: 'KID-PJM-001',
      categorySlug: 'kids-pajamas',
      nameEn: 'Dino Print Pajama Set',
      nameAr: 'طقم بيجاما بطبعة ديناصور',
      descriptionEn: 'Soft cotton pajama set with dinosaur print, top + bottom.',
      descriptionAr: 'طقم بيجاما قطني ناعم بطبعة ديناصور، علوي وسفلي.',
      price: 18.0,
      compareAtPrice: 22.0,
      variants: [
        { size: '2-3Y', color: 'Green' },
        { size: '4-5Y', color: 'Green' },
        { size: '6-7Y', color: 'Green' },
        { size: '4-5Y', color: 'Blue' },
      ],
    },
    {
      sku: 'KID-EVR-001',
      categorySlug: 'kids-everyday',
      nameEn: 'Everyday Cotton T-Shirt',
      nameAr: 'تيشيرت قطني يومي',
      descriptionEn: 'Comfortable everyday cotton t-shirt for kids.',
      descriptionAr: 'تيشيرت قطني مريح للاستخدام اليومي للأطفال.',
      price: 12.0,
      compareAtPrice: null,
      variants: [
        { size: '2-3Y', color: 'Yellow' },
        { size: '4-5Y', color: 'Yellow' },
        { size: '4-5Y', color: 'White' },
      ],
    },
  ];

  for (const p of productDefs) {
    const category = categories.get(p.categorySlug)!;
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { categoryID: category.id, collectionID: category.collectionID },
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
      },
    });

    for (const [i, v] of p.variants.entries()) {
      await prisma.productVariant.upsert({
        where: { sku: `${p.sku}-${i + 1}` },
        update: {},
        create: {
          productID: product.id,
          sku: `${p.sku}-${i + 1}`,
          size: v.size,
          color: v.color,
          stockQuantity: 20,
        },
      });
    }
  }

  console.log('[seed] done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
