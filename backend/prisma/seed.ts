import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('[seed] starting…');

  // ---- Admin user ----
  const adminPasswordHash = await argon2.hash('ChangeMe123!');
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
  const collectionDefs = [
    { slug: 'women', nameEn: 'Women', nameAr: 'نساء', sortOrder: 1, showInNav: true, accentColor: '#a65a7e' },
    { slug: 'men', nameEn: 'Men', nameAr: 'رجال', sortOrder: 2, showInNav: true, accentColor: '#38455c' },
    { slug: 'kids', nameEn: 'Kids', nameAr: 'أطفال', sortOrder: 3, showInNav: true, accentColor: '#b4611e' },
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
        accentColor: c.accentColor,
      },
      create: c,
    });
    collections.set(c.slug, { id: col.id });
  }

  // ---- Categories (bilingual, each linked to one collection) ----
  const categoryDefs = [
    { collectionSlug: 'women', nameEn: 'Lingerie', nameAr: 'ملابس داخلية نسائية', slug: 'women-lingerie' },
    { collectionSlug: 'women', nameEn: 'Nightwear', nameAr: 'ملابس النوم النسائية', slug: 'women-nightwear' },
    { collectionSlug: 'men', nameEn: "Men's Shirts", nameAr: 'قمصان رجالي', slug: 'men-shirts' },
    { collectionSlug: 'men', nameEn: "Men's Underwear", nameAr: 'ملابس داخلية رجالية', slug: 'men-underwear' },
    { collectionSlug: 'kids', nameEn: "Kids' Pajamas", nameAr: 'بيجامات أطفال', slug: 'kids-pajamas' },
    { collectionSlug: 'kids', nameEn: "Kids' Everyday", nameAr: 'ملابس أطفال يومية', slug: 'kids-everyday' },
  ];

  const categories = new Map<string, { id: string; collectionID: string }>();
  for (const c of categoryDefs) {
    const collectionID = collections.get(c.collectionSlug)!.id;
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { collectionID },
      create: { nameEn: c.nameEn, nameAr: c.nameAr, slug: c.slug, collectionID },
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
