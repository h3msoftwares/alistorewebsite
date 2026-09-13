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

// Root category by default — pass `{ parentID: someCategory.id }` in `over`
// to nest it under another category (Stage 1 catalog redesign: Category is a
// pure self-referencing tree, unrelated to Collection — see schema.prisma).
export async function makeCategory(over: Record<string, unknown> = {}) {
  return prisma.category.create({
    data: {
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
  /** Additional (non-canonical) category placements — see ProductCategory. */
  additionalCategoryIds?: string[];
  /** Manual collection memberships — see CollectionProduct. */
  collectionIds?: string[];
}

export async function makeProduct(primaryCategoryID: string, opts: MakeProductOpts = {}) {
  const sku = `sku-${short()}`;
  const variants = opts.variants ?? [{ size: 'M', color: 'Black', stockQuantity: 10 }];
  return prisma.product.create({
    data: {
      sku,
      nameEn: 'Test Product',
      nameAr: 'منتج',
      primaryCategoryID,
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
      ...(opts.additionalCategoryIds?.length
        ? { categoryLinks: { create: opts.additionalCategoryIds.map((categoryID) => ({ categoryID })) } }
        : {}),
      ...(opts.collectionIds?.length
        ? { collectionLinks: { create: opts.collectionIds.map((collectionID) => ({ collectionID })) } }
        : {}),
    },
    include: { variants: true, categoryLinks: true, collectionLinks: true },
  });
}
