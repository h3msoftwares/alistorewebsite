import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/config/prisma';

const short = () => randomUUID().slice(0, 8);

export async function makeCollection(over: Record<string, unknown> = {}) {
  return prisma.collection.create({
    data: {
      nameEn: 'Test Collection',
      nameAr: 'مجموعة',
      slug: `col-${short()}`,
      ...over,
    },
  });
}

// Pass `null` (or omit) for a standalone category unattached to any collection.
export async function makeCategory(
  collectionID: string | null = null,
  over: Record<string, unknown> = {}
) {
  return prisma.category.create({
    data: {
      collectionID,
      nameEn: 'Test Category',
      nameAr: 'فئة',
      slug: `cat-${short()}`,
      ...over,
    },
  });
}

interface MakeProductOpts {
  over?: Record<string, unknown>;
  variants?: {
    sku?: string;
    size?: string | null;
    color?: string | null;
    price?: number | null;
    stockQuantity?: number;
  }[];
}

export async function makeProduct(
  collectionID: string | null,
  categoryID: string,
  opts: MakeProductOpts = {}
) {
  const sku = `sku-${short()}`;
  const variants = opts.variants ?? [{ size: 'M', color: 'Black', stockQuantity: 10 }];
  return prisma.product.create({
    data: {
      sku,
      nameEn: 'Test Product',
      nameAr: 'منتج',
      categoryID,
      collectionID,
      price: 25,
      ...opts.over,
      variants: {
        create: variants.map((v, i) => ({
          sku: v.sku ?? `${sku}-v${i + 1}`,
          size: v.size ?? null,
          color: v.color ?? null,
          price: v.price ?? null,
          stockQuantity: v.stockQuantity ?? 10,
        })),
      },
    },
    include: { variants: true },
  });
}
