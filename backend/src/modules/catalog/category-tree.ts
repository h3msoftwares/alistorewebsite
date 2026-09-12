import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';

// Single home for every "is this category (or something placed in it)
// actually reachable" computation in the catalog. Archived state is NEVER
// written onto a child row when a parent/ancestor is archived (see the
// Category model's doc comment in schema.prisma) — reachability is instead
// computed fresh, from current archivedAt state, every time it's needed.
// Before Stage 1 this logic was copy-pasted between category.service.ts and
// product.service.ts, which is exactly how bug #22 happened (one copy got a
// fix the other didn't); everything below is written once and imported by
// both, plus the admin category picker.

/** Every category id that is itself archived, OR descends (via `parentID`)
 *  from an archived category. Restoring an ancestor's `archivedAt` makes
 *  every id in its subtree fall out of this set on the very next call — no
 *  write to any descendant row is ever needed. */
export async function archivedCategoryIds(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH RECURSIVE archived_closure AS (
      SELECT id FROM "category" WHERE "archivedAt" IS NOT NULL
      UNION
      SELECT c.id FROM "category" c
      JOIN archived_closure a ON c."parentID" = a.id
    )
    SELECT id FROM archived_closure
  `);
  return new Set(rows.map((r) => r.id));
}

/** Whether one specific category is itself archived or has an archived
 *  ancestor — a single category-page lookup, cheaper than the full closure
 *  above when only one id is in question. */
export async function isCategoryEffectivelyArchived(categoryId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ archived: boolean }[]>(Prisma.sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentID", "archivedAt" FROM "category" WHERE id = ${categoryId}::uuid
      UNION ALL
      SELECT c.id, c."parentID", c."archivedAt" FROM "category" c
      JOIN ancestors a ON c.id = a."parentID"
    )
    SELECT bool_or("archivedAt" IS NOT NULL) AS archived FROM ancestors
  `);
  return rows[0]?.archived ?? false;
}

/** Prisma where-fragment: "this product is placed in (one of) the given
 *  category id(s), as its primary category or one of its additional ones."
 *  The one implementation of category membership — category listings, the
 *  onSale category-coverage filter, and CATEGORY-scoped discount matching
 *  all go through this instead of each re-deriving it. */
export function productInCategoryFilter(categoryId: string | string[]): Prisma.ProductWhereInput {
  const ids = Array.isArray(categoryId) ? categoryId : [categoryId];
  return {
    OR: [{ primaryCategoryID: { in: ids } }, { categoryLinks: { some: { categoryID: { in: ids } } } }],
  };
}

/** Prisma where-fragment: "this product is manually placed in (one of) the
 *  given collection id(s)." */
export function productInCollectionFilter(collectionId: string | string[]): Prisma.ProductWhereInput {
  const ids = Array.isArray(collectionId) ? collectionId : [collectionId];
  return { collectionLinks: { some: { collectionID: { in: ids } } } };
}

/** Prisma where-fragment for the general (unscoped) "active" product listing:
 *  a product stays visible as long as AT LEAST ONE of its category
 *  placements (primary or additional) is still reachable — an archived
 *  primary category doesn't hide a product that's still properly placed
 *  elsewhere. Pass the set from `archivedCategoryIds()`. */
export function productReachableFilter(archivedIds: Set<string>): Prisma.ProductWhereInput {
  if (archivedIds.size === 0) return {};
  const ids = [...archivedIds];
  return {
    OR: [
      { primaryCategoryID: { notIn: ids } },
      { categoryLinks: { some: { categoryID: { notIn: ids } } } },
    ],
  };
}

/** Every distinct category id a (hydrated) product is placed in — primary
 *  plus additional links. What CATEGORY-scoped discount matching tests
 *  against (see lib/pricing.ts pickDiscount). */
export function productCategoryIds(product: {
  primaryCategoryID: string;
  categoryLinks?: { categoryID: string }[];
}): string[] {
  const ids = new Set<string>([product.primaryCategoryID]);
  for (const link of product.categoryLinks ?? []) ids.add(link.categoryID);
  return [...ids];
}

/** Every collection id a (hydrated) product is manually placed in — what
 *  COLLECTION-scoped discount matching tests against. Replaces the old
 *  Product.collectionID denormalized mirror, which this Stage 1 redesign
 *  removes outright. */
export function productCollectionIds(product: { collectionLinks?: { collectionID: string }[] }): string[] {
  return [...new Set((product.collectionLinks ?? []).map((link) => link.collectionID))];
}

/** Friendlier 400s in front of the DB trigger's backstop exceptions
 *  (category_compute_path() in migration 20260912000000) — same two rules,
 *  checked here first so a bad request gets a clean AppError instead of a
 *  raw Postgres error surfacing through mapPrismaError. `categoryId` is
 *  omitted (undefined) on create, since there's no "self" yet to violate
 *  either rule against. */
export async function assertValidParent(categoryId: string | undefined, parentId: string | null | undefined) {
  if (!parentId) return;
  if (categoryId && parentId === categoryId) {
    throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent');
  }
  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { path: true } });
  if (!parent) throw new AppError('NOT_FOUND', 'Parent category not found');
  if (categoryId) {
    const self = await prisma.category.findUnique({ where: { id: categoryId }, select: { path: true } });
    if (self && parent.path.startsWith(self.path)) {
      throw new AppError('VALIDATION_ERROR', 'Cannot move a category under its own descendant');
    }
  }
}
