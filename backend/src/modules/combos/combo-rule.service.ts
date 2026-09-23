import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { toNumber } from '../../lib/money';
import { recordAudit } from '../../lib/audit';
import type { ComboRuleCandidate } from '../../lib/combo-pricing';
import { collectionMembershipFilter } from '../catalog/collection-rules';
import { assertHasTargetOrAppliesToAll, assertTargetsExist, previewTargetCoverage, type CategoryTarget } from '../catalog/targeting';
import type { CreateComboRuleInput, UpdateComboRuleInput } from './combo-rule.schema';

// Shared client or an interactive-transaction client — see the note in
// blacklist.service.ts. Callers inside a `$transaction` pass their `tx`.
type Db = typeof prisma | Prisma.TransactionClient;

const comboRuleInclude = {
  tiers: { orderBy: { minQty: 'asc' as const } },
  products: { select: { productID: true, product: { select: { id: true, nameEn: true, nameAr: true, sku: true } } } },
  categories: {
    select: {
      categoryID: true,
      includeDescendants: true,
      category: { select: { id: true, nameEn: true, nameAr: true, slug: true } },
    },
  },
  collections: { select: { collectionID: true, collection: { select: { id: true, nameEn: true, nameAr: true, slug: true } } } },
} satisfies Prisma.ComboRuleInclude;

// ---- Admin CRUD ----

export function listComboRules() {
  return prisma.comboRule.findMany({ orderBy: { dateCreated: 'desc' }, include: comboRuleInclude });
}

export async function getComboRule(id: string) {
  const rule = await prisma.comboRule.findUnique({ where: { id }, include: comboRuleInclude });
  if (!rule) throw new AppError('NOT_FOUND', 'Combo rule not found');
  return rule;
}

function validateShape(input: {
  startsAt?: string | null;
  endsAt?: string | null;
  appliesToAll?: boolean;
  productIds?: string[];
  categoryTargets?: CategoryTarget[];
  collectionIds?: string[];
}) {
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new AppError('VALIDATION_ERROR', 'endsAt must be after startsAt');
  }
  assertHasTargetOrAppliesToAll(
    {
      appliesToAll: input.appliesToAll ?? false,
      productIds: input.productIds ?? [],
      categoryTargets: input.categoryTargets ?? [],
      collectionIds: input.collectionIds ?? [],
    },
    'combo rule'
  );
}

function tierSnapshot(tiers: { minQty: number; maxQty: number | null; price: Prisma.Decimal | number }[]) {
  return tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, price: toNumber(t.price) }));
}

export async function createComboRule(input: CreateComboRuleInput, actorID: string | null) {
  validateShape(input);
  await assertTargetsExist(input.productIds, input.categoryTargets, input.collectionIds);

  const created = await prisma.comboRule.create({
    data: {
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      status: input.status,
      priority: input.priority,
      appliesToAll: input.appliesToAll,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      tiers: { create: input.tiers.map((t, i) => ({ minQty: t.minQty, maxQty: t.maxQty, price: t.price, sortOrder: i })) },
      products: { create: input.productIds.map((productID) => ({ productID })) },
      categories: {
        create: input.categoryTargets.map((t) => ({ categoryID: t.categoryId, includeDescendants: t.includeDescendants })),
      },
      collections: { create: input.collectionIds.map((collectionID) => ({ collectionID })) },
    },
    include: comboRuleInclude,
  });

  await recordAudit({
    entityType: 'comboRule',
    entityID: created.id,
    action: 'comboRule.created',
    actorID,
    metadata: {
      nameEn: created.nameEn,
      status: created.status,
      priority: created.priority,
      appliesToAll: created.appliesToAll,
      tiers: tierSnapshot(created.tiers),
      productCount: created.products.length,
      categoryCount: created.categories.length,
      collectionCount: created.collections.length,
    },
  });

  return created;
}

export async function updateComboRule(id: string, input: UpdateComboRuleInput, actorID: string | null) {
  const existing = await prisma.comboRule.findUnique({
    where: { id },
    include: { products: true, categories: true, collections: true, tiers: { orderBy: { minQty: 'asc' } } },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Combo rule not found');

  // Merge partial input onto the existing row so cross-field validation sees
  // the shape as it will be AFTER this patch — same pattern as
  // promotion.service.ts before it.
  const merged = {
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
    await assertTargetsExist(merged.productIds, merged.categoryTargets, merged.collectionIds, {
      productIds: existing.products.map((p) => p.productID),
      categoryIds: existing.categories.map((c) => c.categoryID),
      collectionIds: existing.collections.map((c) => c.collectionID),
    });
  }

  // Diff of exactly the fields this PATCH actually changes — the "what
  // changed" half of the audit-log entry (who = actorID, when =
  // AuditLog.createdAt). Compared by value (JSON), not by reference, since
  // e.g. `tiers`/`productIds` are always freshly-built arrays either way.
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const noteChange = (key: string, prevValue: unknown, nextValue: unknown) => {
    if (JSON.stringify(prevValue) === JSON.stringify(nextValue)) return;
    before[key] = prevValue;
    after[key] = nextValue;
  };
  if (input.nameEn !== undefined) noteChange('nameEn', existing.nameEn, input.nameEn);
  if (input.nameAr !== undefined) noteChange('nameAr', existing.nameAr, input.nameAr);
  if (input.status !== undefined) noteChange('status', existing.status, input.status);
  if (input.priority !== undefined) noteChange('priority', existing.priority, input.priority);
  if (input.appliesToAll !== undefined) noteChange('appliesToAll', existing.appliesToAll, input.appliesToAll);
  if (input.startsAt !== undefined) noteChange('startsAt', existing.startsAt?.toISOString() ?? null, input.startsAt);
  if (input.endsAt !== undefined) noteChange('endsAt', existing.endsAt?.toISOString() ?? null, input.endsAt);
  if (input.tiers !== undefined) noteChange('tiers', tierSnapshot(existing.tiers), input.tiers);
  if (input.productIds !== undefined) noteChange('productIds', existing.products.map((p) => p.productID), input.productIds);
  if (input.categoryTargets !== undefined) {
    noteChange(
      'categoryTargets',
      existing.categories.map((c) => ({ categoryId: c.categoryID, includeDescendants: c.includeDescendants })),
      input.categoryTargets
    );
  }
  if (input.collectionIds !== undefined) noteChange('collectionIds', existing.collections.map((c) => c.collectionID), input.collectionIds);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.comboRule.update({
        where: { id },
        data: {
          ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
          ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.appliesToAll !== undefined ? { appliesToAll: input.appliesToAll } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        },
      });
      if (input.tiers !== undefined) {
        await tx.comboTier.deleteMany({ where: { comboRuleID: id } });
        await tx.comboTier.createMany({
          data: input.tiers.map((t, i) => ({ comboRuleID: id, minQty: t.minQty, maxQty: t.maxQty, price: t.price, sortOrder: i })),
        });
      }
      if (input.productIds !== undefined) {
        await tx.comboRuleProduct.deleteMany({ where: { comboRuleID: id } });
        await tx.comboRuleProduct.createMany({
          data: input.productIds.map((productID) => ({ comboRuleID: id, productID })),
        });
      }
      if (input.categoryTargets !== undefined) {
        await tx.comboRuleCategory.deleteMany({ where: { comboRuleID: id } });
        await tx.comboRuleCategory.createMany({
          data: input.categoryTargets.map((t) => ({
            comboRuleID: id,
            categoryID: t.categoryId,
            includeDescendants: t.includeDescendants,
          })),
        });
      }
      if (input.collectionIds !== undefined) {
        await tx.comboRuleCollection.deleteMany({ where: { comboRuleID: id } });
        await tx.comboRuleCollection.createMany({
          data: input.collectionIds.map((collectionID) => ({ comboRuleID: id, collectionID })),
        });
      }
    });

    if (Object.keys(after).length > 0) {
      await recordAudit({
        entityType: 'comboRule',
        entityID: id,
        action: 'comboRule.updated',
        actorID,
        metadata: { before, after },
      });
    }

    return prisma.comboRule.findUniqueOrThrow({ where: { id }, include: comboRuleInclude });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw mapPrismaError(e);
  }
}

export async function deleteComboRule(id: string, actorID: string | null) {
  const existing = await prisma.comboRule.findUnique({
    where: { id },
    include: { tiers: true, products: true, categories: true, collections: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Combo rule not found');
  await prisma.comboRule.delete({ where: { id } });

  await recordAudit({
    entityType: 'comboRule',
    entityID: id,
    action: 'comboRule.deleted',
    actorID,
    metadata: {
      nameEn: existing.nameEn,
      status: existing.status,
      tiers: tierSnapshot(existing.tiers),
      productCount: existing.products.length,
      categoryCount: existing.categories.length,
      collectionCount: existing.collections.length,
    },
  });
}

// ---- Read-side: the combo rules in force right now ----

/** Every ComboRule that is ACTIVE and within its time window at `at`.
 *  Mirrors promotion.service.ts's activePromotions() structure, including
 *  its AUTOMATED/HYBRID collection-membership resolution — kept as its own
 *  implementation rather than sharing code with activePromotions() beyond
 *  that mirrored structure, since the two return shapes genuinely differ
 *  (tiers vs. type/value/stackable) — see the design plan.
 *
 *  `db` defaults to the plain client for read-only callers (cart, product
 *  listings); checkout() passes its `tx` explicitly (same extra-pool-
 *  pressure reason as activePromotions()). */
export async function activeComboRules(at: Date = new Date(), db: Db = prisma): Promise<ComboRuleCandidate[]> {
  const rows = await db.comboRule.findMany({
    where: {
      status: 'ACTIVE',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
      ],
    },
    include: {
      tiers: { orderBy: { minQty: 'asc' } },
      products: { select: { productID: true } },
      categories: {
        select: { includeDescendants: true, category: { select: { path: true, nameEn: true, nameAr: true } } },
      },
      collections: {
        select: { collection: { select: { id: true, type: true, nameEn: true, nameAr: true } } },
      },
    },
  });

  // See activePromotions()'s identical comment: an AUTOMATED/HYBRID
  // collection target has no real ComboRuleCollection-membership join row to
  // match a product against directly, so its current membership is resolved
  // here and folded into `productIds`.
  const ruleBasedCollectionIds = [
    ...new Set(
      rows.flatMap((r) => r.collections.filter((c) => c.collection.type !== 'MANUAL').map((c) => c.collection.id))
    ),
  ];
  const resolvedMembers = new Map<string, string[]>();
  if (ruleBasedCollectionIds.length) {
    const collections = await db.collection.findMany({
      where: { id: { in: ruleBasedCollectionIds } },
      select: { id: true, type: true },
    });
    for (const collection of collections) {
      const where = await collectionMembershipFilter(collection);
      const matches = await db.product.findMany({ where, select: { id: true } });
      resolvedMembers.set(
        collection.id,
        matches.map((m) => m.id)
      );
    }
  }

  return rows.map((r) => {
    const ruleBasedCollections = r.collections.filter((c) => c.collection.type !== 'MANUAL');
    const ruleBasedProductIds = ruleBasedCollections.flatMap((c) => resolvedMembers.get(c.collection.id) ?? []);
    const directProductIds = r.products.map((x) => x.productID);

    const ruleBasedProductCollections: Record<string, { id: string; nameEn: string; nameAr: string }> = {};
    for (const c of ruleBasedCollections) {
      for (const productId of resolvedMembers.get(c.collection.id) ?? []) {
        ruleBasedProductCollections[productId] ??= {
          id: c.collection.id,
          nameEn: c.collection.nameEn,
          nameAr: c.collection.nameAr,
        };
      }
    }

    return {
      id: r.id,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      priority: r.priority,
      appliesToAll: r.appliesToAll,
      productIds: [...new Set([...directProductIds, ...ruleBasedProductIds])],
      directProductIds,
      categoryTargets: r.categories.map((c) => ({
        path: c.category.path,
        includeDescendants: c.includeDescendants,
        nameEn: c.category.nameEn,
        nameAr: c.category.nameAr,
      })),
      collections: r.collections.map((c) => ({
        id: c.collection.id,
        nameEn: c.collection.nameEn,
        nameAr: c.collection.nameAr,
      })),
      ruleBasedProductCollections,
      tiers: r.tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, price: toNumber(t.price) })),
    };
  });
}

/** "Which live products would this combo rule actually cover" — thin
 *  wrapper over the generic previewTargetCoverage() (catalog/targeting.ts),
 *  shared with Promotion's own coverage preview. */
export const previewComboCoverage = previewTargetCoverage;

export function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2003' || e.code === 'P2025')) {
    return new AppError('NOT_FOUND', 'Referenced record not found');
  }
  return e as Error;
}
