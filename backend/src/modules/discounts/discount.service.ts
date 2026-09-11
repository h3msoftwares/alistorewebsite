import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { toNumber } from '../../lib/money';
import type { DiscountCandidate } from '../../lib/pricing';
import type { CreateDiscountInput, UpdateDiscountInput } from './discount.schema';

// Shared client or an interactive-transaction client — see the note in
// blacklist.service.ts. Callers inside a `$transaction` pass their `tx`.
type Db = typeof prisma | Prisma.TransactionClient;

// ---- Admin CRUD ----

export function listDiscounts() {
  return prisma.discount.findMany({
    orderBy: { dateCreated: 'desc' },
    include: {
      collection: { select: { id: true, nameEn: true, nameAr: true } },
      category: { select: { id: true, nameEn: true, nameAr: true } },
    },
  });
}

function validateShape(input: {
  scope?: 'ALL' | 'COLLECTION' | 'CATEGORY';
  collectionId?: string | null;
  categoryId?: string | null;
  type?: 'PERCENT' | 'AMOUNT';
  value?: number;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  if (input.type === 'PERCENT' && input.value != null && (input.value <= 0 || input.value > 100)) {
    throw new AppError('VALIDATION_ERROR', 'A percentage discount must be between 0 and 100');
  }
  if (input.scope === 'COLLECTION' && !input.collectionId) {
    throw new AppError('VALIDATION_ERROR', 'A collection discount needs a collectionId');
  }
  if (input.scope === 'CATEGORY' && !input.categoryId) {
    throw new AppError('VALIDATION_ERROR', 'A category discount needs a categoryId');
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new AppError('VALIDATION_ERROR', 'endsAt must be after startsAt');
  }
}

async function assertTargetExists(scope: string, collectionId?: string | null, categoryId?: string | null) {
  if (scope === 'COLLECTION' && collectionId) {
    const c = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
    if (!c) throw new AppError('NOT_FOUND', 'collectionId does not match a collection');
  }
  if (scope === 'CATEGORY' && categoryId) {
    const c = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!c) throw new AppError('NOT_FOUND', 'categoryId does not match a category');
  }
}

// Only the target that matches the scope is stored; the other is forced null.
function targetIds(scope: string, collectionId?: string | null, categoryId?: string | null) {
  return {
    collectionID: scope === 'COLLECTION' ? (collectionId ?? null) : null,
    categoryID: scope === 'CATEGORY' ? (categoryId ?? null) : null,
  };
}

export async function createDiscount(input: CreateDiscountInput) {
  validateShape(input);
  await assertTargetExists(input.scope, input.collectionId, input.categoryId);
  return prisma.discount.create({
    data: {
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      scope: input.scope,
      type: input.type,
      value: input.value,
      stacking: input.stacking,
      isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      ...targetIds(input.scope, input.collectionId, input.categoryId),
    },
  });
}

export async function updateDiscount(id: string, input: UpdateDiscountInput) {
  const existing = await prisma.discount.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Discount not found');

  const scope = input.scope ?? existing.scope;
  const collectionId = input.collectionId !== undefined ? input.collectionId : existing.collectionID;
  const categoryId = input.categoryId !== undefined ? input.categoryId : existing.categoryID;
  const type = input.type ?? existing.type;
  const value = input.value ?? toNumber(existing.value);
  const startsAt = input.startsAt !== undefined ? input.startsAt : existing.startsAt?.toISOString() ?? null;
  const endsAt = input.endsAt !== undefined ? input.endsAt : existing.endsAt?.toISOString() ?? null;
  validateShape({ scope, collectionId, categoryId, type, value, startsAt, endsAt });
  await assertTargetExists(scope, collectionId, categoryId);

  return prisma.discount.update({
    where: { id },
    data: {
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.stacking !== undefined ? { stacking: input.stacking } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
      // Scope + its target move together; the non-matching id is nulled.
      ...(input.scope !== undefined ||
      input.collectionId !== undefined ||
      input.categoryId !== undefined
        ? { scope, ...targetIds(scope, collectionId, categoryId) }
        : {}),
    },
  });
}

export async function deleteDiscount(id: string) {
  const existing = await prisma.discount.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Discount not found');
  await prisma.discount.delete({ where: { id } });
}

// ---- Read-side: the discounts in force right now ----

/** Every discount that is active and within its time window at `at`. Small
 *  table, no cache — called once per product-listing / cart / checkout.
 *
 *  `db` defaults to the plain client for every read-only caller (product
 *  listings, cart, favourites); checkout() passes its `tx` explicitly
 *  (fix-list.md #11, resolves 1.8) — without that, this call from inside
 *  checkout()'s transaction reached into the pool for its own separate
 *  connection on top of the one the transaction already held, the same
 *  extra-pool-pressure pattern found and fixed in isBlacklisted(). */
export async function activeDiscounts(at: Date = new Date(), db: Db = prisma): Promise<DiscountCandidate[]> {
  const rows = await db.discount.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
      ],
    },
  });
  return rows.map((d) => ({
    id: d.id,
    scope: d.scope,
    collectionID: d.collectionID,
    categoryID: d.categoryID,
    type: d.type,
    value: toNumber(d.value),
    stacking: d.stacking,
  }));
}

/** The category/collection ids covered by an active discount right now, plus
 *  whether an ALL-scoped discount is live. Powers the `onSale` list filter. */
export function discountCoverage(discounts: DiscountCandidate[]) {
  return {
    all: discounts.some((d) => d.scope === 'ALL'),
    collectionIds: discounts.filter((d) => d.scope === 'COLLECTION' && d.collectionID).map((d) => d.collectionID as string),
    categoryIds: discounts.filter((d) => d.scope === 'CATEGORY' && d.categoryID).map((d) => d.categoryID as string),
  };
}

export function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2003' || e.code === 'P2025')) {
    return new AppError('NOT_FOUND', 'Referenced record not found');
  }
  return e as Error;
}
