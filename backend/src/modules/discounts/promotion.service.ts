import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { toNumber } from '../../lib/money';
import type { PromotionCandidate } from '../../lib/pricing';
import { productInCategoryPathFilter } from '../catalog/category-tree';
import type { CreatePromotionInput, UpdatePromotionInput } from './promotion.schema';

// Shared client or an interactive-transaction client — see the note in
// blacklist.service.ts. Callers inside a `$transaction` pass their `tx`.
type Db = typeof prisma | Prisma.TransactionClient;

const promotionInclude = {
  products: { select: { productID: true, product: { select: { id: true, nameEn: true, nameAr: true, sku: true } } } },
  categories: {
    select: {
      categoryID: true,
      includeDescendants: true,
      category: { select: { id: true, nameEn: true, nameAr: true, slug: true } },
    },
  },
  collections: { select: { collectionID: true, collection: { select: { id: true, nameEn: true, nameAr: true, slug: true } } } },
} satisfies Prisma.PromotionInclude;

// ---- Admin CRUD ----

export function listPromotions() {
  return prisma.promotion.findMany({ orderBy: { dateCreated: 'desc' }, include: promotionInclude });
}

export async function getPromotion(id: string) {
  const promo = await prisma.promotion.findUnique({ where: { id }, include: promotionInclude });
  if (!promo) throw new AppError('NOT_FOUND', 'Promotion not found');
  return promo;
}

type CategoryTarget = { categoryId: string; includeDescendants: boolean };

function validateShape(input: {
  type?: 'PERCENT' | 'AMOUNT';
  value?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  appliesToAll?: boolean;
  productIds?: string[];
  categoryTargets?: CategoryTarget[];
  collectionIds?: string[];
}) {
  if (input.type === 'PERCENT' && input.value != null && (input.value <= 0 || input.value > 100)) {
    throw new AppError('VALIDATION_ERROR', 'A percentage promotion must be between 0 and 100');
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new AppError('VALIDATION_ERROR', 'endsAt must be after startsAt');
  }
  const targetCount =
    (input.productIds?.length ?? 0) + (input.categoryTargets?.length ?? 0) + (input.collectionIds?.length ?? 0);
  if (input.appliesToAll && targetCount > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A site-wide promotion cannot also carry specific product/category/collection targets'
    );
  }
  if (!input.appliesToAll && targetCount === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A promotion needs at least one target (a product, category, or collection), or must be marked site-wide'
    );
  }
}

async function assertTargetsExist(productIds: string[], categoryTargets: CategoryTarget[], collectionIds: string[]) {
  if (productIds.length) {
    const found = await prisma.product.count({ where: { id: { in: productIds } } });
    if (found !== new Set(productIds).size) throw new AppError('NOT_FOUND', 'One or more productIds were not found');
  }
  if (categoryTargets.length) {
    const ids = categoryTargets.map((t) => t.categoryId);
    const found = await prisma.category.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw new AppError('NOT_FOUND', 'One or more category targets were not found');
  }
  if (collectionIds.length) {
    const found = await prisma.collection.count({ where: { id: { in: collectionIds } } });
    if (found !== new Set(collectionIds).size) throw new AppError('NOT_FOUND', 'One or more collectionIds were not found');
  }
}

export async function createPromotion(input: CreatePromotionInput) {
  validateShape(input);
  await assertTargetsExist(input.productIds, input.categoryTargets, input.collectionIds);
  return prisma.promotion.create({
    data: {
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      status: input.status,
      type: input.type,
      value: input.value,
      priority: input.priority,
      stackable: input.stackable,
      appliesToAll: input.appliesToAll,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      products: { create: input.productIds.map((productID) => ({ productID })) },
      categories: {
        create: input.categoryTargets.map((t) => ({ categoryID: t.categoryId, includeDescendants: t.includeDescendants })),
      },
      collections: { create: input.collectionIds.map((collectionID) => ({ collectionID })) },
    },
    include: promotionInclude,
  });
}

export async function updatePromotion(id: string, input: UpdatePromotionInput) {
  const existing = await prisma.promotion.findUnique({
    where: { id },
    include: { products: true, categories: true, collections: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Promotion not found');

  // Merge partial input onto the existing row so cross-field validation sees
  // the shape as it will be AFTER this patch — same pattern as
  // category.service.ts / collection.service.ts before it.
  const merged = {
    type: input.type ?? existing.type,
    value: input.value ?? toNumber(existing.value),
    startsAt: input.startsAt !== undefined ? input.startsAt : (existing.startsAt?.toISOString() ?? null),
    endsAt: input.endsAt !== undefined ? input.endsAt : (existing.endsAt?.toISOString() ?? null),
    appliesToAll: input.appliesToAll ?? existing.appliesToAll,
    productIds: input.productIds ?? existing.products.map((p) => p.productID),
    categoryTargets:
      input.categoryTargets ??
      existing.categories.map((c) => ({ categoryId: c.categoryID, includeDescendants: c.includeDescendants })),
    collectionIds: input.collectionIds ?? existing.collections.map((c) => c.collectionID),
  };
  validateShape(merged);
  if (input.productIds !== undefined || input.categoryTargets !== undefined || input.collectionIds !== undefined) {
    await assertTargetsExist(merged.productIds, merged.categoryTargets, merged.collectionIds);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.promotion.update({
        where: { id },
        data: {
          ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
          ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.value !== undefined ? { value: input.value } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.stackable !== undefined ? { stackable: input.stackable } : {}),
          ...(input.appliesToAll !== undefined ? { appliesToAll: input.appliesToAll } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        },
      });
      if (input.productIds !== undefined) {
        await tx.promotionProduct.deleteMany({ where: { promotionID: id } });
        await tx.promotionProduct.createMany({
          data: input.productIds.map((productID) => ({ promotionID: id, productID })),
        });
      }
      if (input.categoryTargets !== undefined) {
        await tx.promotionCategory.deleteMany({ where: { promotionID: id } });
        await tx.promotionCategory.createMany({
          data: input.categoryTargets.map((t) => ({
            promotionID: id,
            categoryID: t.categoryId,
            includeDescendants: t.includeDescendants,
          })),
        });
      }
      if (input.collectionIds !== undefined) {
        await tx.promotionCollection.deleteMany({ where: { promotionID: id } });
        await tx.promotionCollection.createMany({
          data: input.collectionIds.map((collectionID) => ({ promotionID: id, collectionID })),
        });
      }
    });
    return prisma.promotion.findUniqueOrThrow({ where: { id }, include: promotionInclude });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw mapPrismaError(e);
  }
}

export async function deletePromotion(id: string) {
  const existing = await prisma.promotion.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Promotion not found');
  await prisma.promotion.delete({ where: { id } });
}

// ---- Read-side: the promotions in force right now ----

/** Every promotion that is ACTIVE and within its time window at `at`. Small
 *  table, no cache — called once per product-listing / cart / checkout.
 *
 *  `db` defaults to the plain client for every read-only caller (product
 *  listings, cart, favourites); checkout() passes its `tx` explicitly (same
 *  extra-pool-pressure reason as the old `activeDiscounts()` — see
 *  order.service.ts). */
export async function activePromotions(at: Date = new Date(), db: Db = prisma): Promise<PromotionCandidate[]> {
  const rows = await db.promotion.findMany({
    where: {
      status: 'ACTIVE',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
      ],
    },
    include: {
      products: { select: { productID: true } },
      categories: { select: { includeDescendants: true, category: { select: { path: true } } } },
      collections: { select: { collectionID: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    type: p.type,
    value: toNumber(p.value),
    stackable: p.stackable,
    priority: p.priority,
    appliesToAll: p.appliesToAll,
    productIds: p.products.map((x) => x.productID),
    categoryTargets: p.categories.map((c) => ({ path: c.category.path, includeDescendants: c.includeDescendants })),
    collectionIds: p.collections.map((x) => x.collectionID),
  }));
}

/** Prisma where-fragment: "this product is covered by at least one of the
 *  given (already-active) promotions" — powers the `onSale=true` listing
 *  filter and CollectionRule's HAS_ACTIVE_PROMOTION field, both of which
 *  need to narrow a SQL query rather than test an already-fetched row.
 *  `{ id: { in: [] } }` (matches nothing) when nothing is covered, rather
 *  than a sentinel string — keeps the WHERE clause type-valid regardless of
 *  the id column type. */
export function promotionCoverageFilter(promotions: PromotionCandidate[]): Prisma.ProductWhereInput {
  if (promotions.some((p) => p.appliesToAll)) return {};

  const productIds = promotions.flatMap((p) => p.productIds);
  const collectionIds = promotions.flatMap((p) => p.collectionIds);
  const categoryTargets = promotions.flatMap((p) => p.categoryTargets);

  const or: Prisma.ProductWhereInput[] = [];
  if (productIds.length) or.push({ id: { in: productIds } });
  if (collectionIds.length) or.push({ collectionLinks: { some: { collectionID: { in: collectionIds } } } });
  for (const t of categoryTargets) or.push(productInCategoryPathFilter(t.path, t.includeDescendants));

  return or.length ? { OR: or } : { id: { in: [] } };
}

export function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2003' || e.code === 'P2025')) {
    return new AppError('NOT_FOUND', 'Referenced record not found');
  }
  return e as Error;
}
