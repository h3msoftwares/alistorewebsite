import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { productInCategoryPathFilter } from './category-tree';
import { collectionMembershipFilter } from './collection-rules';

// Generic "product / category / collection (+ site-wide)" targeting shared
// by Promotion (promotion.service.ts) and ComboRule (combo-rule.service.ts)
// — the two admin-configurable pricing rules that scope to the exact same
// kind of target set. Kept as its own module (not folded into
// category-tree.ts) to avoid a category-tree.ts <-> collection-rules.ts
// import cycle, since collectionMembershipFilter lives in collection-rules.ts
// which already imports FROM category-tree.ts.

export type CategoryTarget = { categoryId: string; includeDescendants: boolean };

export interface TargetSet {
  appliesToAll: boolean;
  productIds: string[];
  categoryTargets: CategoryTarget[];
  collectionIds: string[];
}

/** Cross-field shape checks any targetable rule needs: exactly one of
 *  "site-wide" or "has at least one target". Percent-range / date-window
 *  checks are rule-specific and stay with each caller. */
export function assertHasTargetOrAppliesToAll(input: TargetSet, ruleLabel: string): void {
  const targetCount = input.productIds.length + input.categoryTargets.length + input.collectionIds.length;
  if (input.appliesToAll && targetCount > 0) {
    throw new AppError('VALIDATION_ERROR', `A site-wide ${ruleLabel} cannot also carry specific product/category/collection targets`);
  }
  if (!input.appliesToAll && targetCount === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      `A ${ruleLabel} needs at least one target (a product, category, or collection), or must be marked site-wide`
    );
  }
}

/** `existing` is the target set the rule already had *before* this save
 *  (omitted on create, where nothing is existing yet). A target that's newly
 *  added must be a live, reachable product/category/collection — but
 *  resubmitting one the rule already targets must still succeed even if it's
 *  since been archived/deleted, or the rule could never be edited again for
 *  any reason once one of its targets goes away. Same principle as
 *  product.service.ts's assertCategoriesAssignable. Shared verbatim by
 *  Promotion and ComboRule — see this module's doc comment. */
export async function assertTargetsExist(
  productIds: string[],
  categoryTargets: CategoryTarget[],
  collectionIds: string[],
  existing?: { productIds: string[]; categoryIds: string[]; collectionIds: string[] }
): Promise<void> {
  if (productIds.length) {
    const found = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, deletedAt: true },
    });
    if (found.length !== new Set(productIds).size) {
      throw new AppError('NOT_FOUND', 'One or more productIds were not found');
    }
    const existingIds = new Set(existing?.productIds ?? []);
    if (found.some((p) => p.deletedAt && !existingIds.has(p.id))) {
      throw new AppError('CONFLICT', 'Cannot target a deleted product');
    }
  }
  if (categoryTargets.length) {
    const ids = categoryTargets.map((t) => t.categoryId);
    const found = await prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, archivedAt: true },
    });
    if (found.length !== new Set(ids).size) {
      throw new AppError('NOT_FOUND', 'One or more category targets were not found');
    }
    const existingIds = new Set(existing?.categoryIds ?? []);
    if (found.some((c) => c.archivedAt && !existingIds.has(c.id))) {
      throw new AppError('CONFLICT', 'Cannot target an archived category');
    }
  }
  if (collectionIds.length) {
    const found = await prisma.collection.findMany({
      where: { id: { in: collectionIds } },
      select: { id: true, archivedAt: true },
    });
    if (found.length !== new Set(collectionIds).size) {
      throw new AppError('NOT_FOUND', 'One or more collectionIds were not found');
    }
    const existingIds = new Set(existing?.collectionIds ?? []);
    if (found.some((c) => c.archivedAt && !existingIds.has(c.id))) {
      throw new AppError('CONFLICT', 'Cannot target an archived collection');
    }
  }
}

export interface TargetCoveragePreview {
  count: number;
  sample: { id: string; nameEn: string; nameAr: string; sku: string }[];
}

/** "Which live products would this target set actually cover" — computed
 *  directly from a draft target set (before or after the owning rule is
 *  saved), so an admin form can show it while still editing. Mirrors
 *  activePromotions()'s/activeComboRules()'s AUTOMATED/HYBRID collection
 *  resolution rather than the simpler manual-membership-only check
 *  promotionCoverageFilter() uses, since that one only works from an
 *  already-persisted rule's resolved `productIds`. */
export async function previewTargetCoverage(input: TargetSet): Promise<TargetCoveragePreview> {
  const base: Prisma.ProductWhereInput = { isActive: true, deletedAt: null };
  let where: Prisma.ProductWhereInput;

  if (input.appliesToAll) {
    where = base;
  } else {
    const or: Prisma.ProductWhereInput[] = [];

    if (input.productIds.length) or.push({ id: { in: input.productIds } });

    if (input.categoryTargets.length) {
      const categories = await prisma.category.findMany({
        where: { id: { in: input.categoryTargets.map((t) => t.categoryId) } },
        select: { id: true, path: true },
      });
      const pathByID = new Map(categories.map((c) => [c.id, c.path]));
      for (const t of input.categoryTargets) {
        const path = pathByID.get(t.categoryId);
        if (path) or.push(productInCategoryPathFilter(path, t.includeDescendants));
      }
    }

    if (input.collectionIds.length) {
      const collections = await prisma.collection.findMany({
        where: { id: { in: input.collectionIds } },
        select: { id: true, type: true },
      });
      for (const c of collections) or.push(await collectionMembershipFilter(c));
    }

    where = or.length ? { AND: [base, { OR: or }] } : { id: { in: [] } };
  }

  const [count, sample] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: { id: true, nameEn: true, nameAr: true, sku: true },
      orderBy: { dateCreated: 'desc' },
      take: 8,
    }),
  ]);

  return { count, sample };
}
