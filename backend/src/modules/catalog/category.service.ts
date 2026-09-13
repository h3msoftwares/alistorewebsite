import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createCategorySchema, updateCategorySchema } from './category.schema';
import type { listProductsQuerySchema } from './product.schema';
import { listProducts } from './product.service';
import type { CreateImageInput, UpdateImageInput } from './image.schema';
import { cleanupCatalogImageIfOrphaned } from './image-cleanup.service';
import { archivedCategoryIds, assertValidParent, isCategoryEffectivelyArchived } from './category-tree';

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Same ordering ProductImage uses — the lowest-sortOrder row is the "base" image.
const imageOrder = { orderBy: { sortOrder: 'asc' as const } };

const categoryInclude = {
  images: imageOrder,
  children: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
    include: { images: imageOrder },
  },
  // Nested up to 4 levels — same fixed, non-recursive depth as a product's
  // primaryCategory (see product.service.ts's productInclude) — so the
  // storefront can render this category's own ancestor chain (for the page
  // header's accent theming and breadcrumb) without an extra request.
  parent: { include: { parent: { include: { parent: true } } } },
};

export type CatalogStatus = 'active' | 'archived' | 'all';

interface ListCategoriesOpts {
  /** Only root categories (no parent). */
  topLevel?: boolean;
  parentId?: string;
  /** Only categories promoted to their own home-page row. */
  showOnHome?: boolean;
  search?: string;
  /** `active` (storefront) = not archived + isActive; `archived` / `all` are admin-only. */
  status?: CatalogStatus;
}

function statusWhere(status: CatalogStatus): Prisma.CategoryWhereInput {
  if (status === 'archived') return { archivedAt: { not: null } };
  if (status === 'all') return {};
  return { archivedAt: null, isActive: true };
}

/** Annotates each category with `isEffectivelyArchived` — itself archived OR
 *  descending from an archived ancestor — computed fresh every call (never
 *  written to the row). Powers the admin category picker's "flag archived
 *  options instead of hiding or silently allowing them" requirement: a
 *  category can look active on its own row while sitting under an archived
 *  ancestor, which would otherwise be invisible to whoever is picking it. */
async function withEffectiveArchived<T extends { id: string }>(categories: T[]) {
  const archived = await archivedCategoryIds();
  return categories.map((c) => ({ ...c, isEffectivelyArchived: archived.has(c.id) }));
}

export async function listCategories(opts: ListCategoriesOpts = {}) {
  const { parentId, topLevel, showOnHome } = opts;
  const where: Prisma.CategoryWhereInput = {
    ...statusWhere(opts.status ?? 'active'),
    ...(parentId ? { parentID: parentId } : {}),
    ...(topLevel ? { parentID: null } : {}),
    ...(showOnHome ? { showOnHome: true } : {}),
    ...(opts.search
      ? {
          OR: [
            { nameEn: { contains: opts.search, mode: 'insensitive' } },
            { nameAr: { contains: opts.search, mode: 'insensitive' } },
            { slug: { contains: opts.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const categories = await prisma.category.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
    include: categoryInclude,
  });
  return withEffectiveArchived(categories);
}

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({ where: { id }, include: categoryInclude });
  if (!category) throw new AppError('NOT_FOUND', 'Category not found');
  const [withFlag] = await withEffectiveArchived([category]);
  return withFlag;
}

// Public storefront lookup — same "active" gate as getCollectionBySlug, for
// the same reason (fix-list.md #8, resolves 12.1). Previously unfiltered, so
// an archived category's direct slug URL stayed fully live.
//
// Also 404s when an ANCESTOR category is archived (fix-list.md #22, resolves
// category-reachable-parent-archived), even though this category's own row
// is untouched — archiving a category never writes to its descendants (see
// the Category model's doc comment), so a descendant's own `archivedAt`/
// `isActive` stays "active" even when an ancestor is archived. Before the
// Stage 1 catalog redesign, "ancestor" meant "parent COLLECTION" (Category
// sat under Collection); Category is now a pure self-referencing tree with
// no Collection above it at all, so the equivalent structural check is
// "any ancestor CATEGORY archived" instead — same guarantee, re-derived onto
// the new relationship rather than forcing the old one to keep existing.
export async function getCategoryBySlug(slug: string) {
  const category = await prisma.category.findFirst({
    where: { slug, ...statusWhere('active') },
    include: categoryInclude,
  });
  if (!category) throw new AppError('NOT_FOUND', 'Category not found');
  if (await isCategoryEffectivelyArchived(category.id)) {
    throw new AppError('NOT_FOUND', 'Category not found');
  }
  return category;
}

// Products preview for a category — the same shaped, paginated list
// `GET /api/products` returns (with effectivePrice / onSale), scoped to this
// category (primary or additional placement — see category-tree.ts).
export async function listCategoryProducts(id: string, query: ListProductsQuery) {
  await ensureCategoryExists(id);
  return listProducts({ ...query, categoryId: id });
}

// ---- Admin-side writes ----

export async function createCategory(input: CreateCategoryInput) {
  const { parentId, ...rest } = input;
  await assertValidParent(undefined, parentId);
  try {
    return await prisma.category.create({
      data: {
        ...rest,
        ...(parentId ? { parent: { connect: { id: parentId } } } : {}),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await ensureCategoryExists(id);
  const { parentId, ...rest } = input;
  if (parentId !== undefined) await assertValidParent(id, parentId);

  try {
    return await prisma.category.update({
      where: { id },
      data: {
        ...rest,
        // undefined ⇒ leave as-is; null ⇒ becomes a root category; id ⇒ re-parent.
        ...(parentId === undefined
          ? {}
          : parentId === null
            ? { parent: { disconnect: true } }
            : { parent: { connect: { id: parentId } } }),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Admin's primary "remove" — hidden from the storefront (itself and, via the
// read-time ancestor check, everything under it), kept + restorable. Never
// writes to descendant rows — see the Category model's doc comment.
export async function archiveCategory(id: string) {
  await ensureCategoryExists(id);
  return prisma.category.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
    include: categoryInclude,
  });
}

export async function restoreCategory(id: string) {
  await ensureCategoryExists(id);
  return prisma.category.update({
    where: { id },
    data: { archivedAt: null, isActive: true },
    include: categoryInclude,
  });
}

// Permanent, irreversible — only once the category is archived AND empty of
// BOTH child categories and products (primary or additional placement).
//
// The child-category check is new in the Stage 1 redesign: the old
// Category.parent relation was `onDelete: SetNull`, so deleting a category
// with subcategories silently promoted them to new roots instead of being
// blocked — the exact same "orphan on delete" inconsistency this codebase
// already rejects for products (see the productCount check below, which
// predates this). There is no principled reason categories should be exempt
// from a rule products are already held to, so this closes that gap on its
// own correctness merits — not to satisfy an old test, which recorded the
// orphaning behavior as "Pass" and needs to be corrected to match, not kept
// as a baseline. The FK itself is now `onDelete: RESTRICT` as a DB-level
// backstop; this check exists purely to give a clean 409 instead of a raw
// constraint-violation error.
export async function deleteCategory(id: string) {
  const existing = await prisma.category.findUnique({ where: { id }, select: { archivedAt: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Category not found');
  if (!existing.archivedAt) {
    throw new AppError('CONFLICT', 'Archive the category before deleting it permanently.');
  }
  const childCount = await prisma.category.count({ where: { parentID: id } });
  if (childCount > 0) {
    throw new AppError(
      'CONFLICT',
      `Cannot delete a category that still has ${childCount} child categor${childCount === 1 ? 'y' : 'ies'}.`
    );
  }
  const productCount = await prisma.product.count({
    where: { OR: [{ primaryCategoryID: id }, { categoryLinks: { some: { categoryID: id } } }] },
  });
  if (productCount > 0) {
    throw new AppError(
      'CONFLICT',
      `Cannot delete a category that still has ${productCount} product(s).`
    );
  }
  const images = await prisma.categoryImage.findMany({ where: { categoryID: id }, select: { fileId: true } });
  // Postgres cascade (CategoryImage.category onDelete: Cascade) removes the
  // image rows along with the category itself.
  await prisma.category.delete({ where: { id } });
  await Promise.all(images.map((img) => cleanupCatalogImageIfOrphaned(img.fileId)));
}

// ---- Images (sub-resource) ----

export async function addImage(categoryId: string, input: CreateImageInput) {
  await ensureCategoryExists(categoryId);
  return prisma.categoryImage.create({ data: { categoryID: categoryId, ...input } });
}

export async function updateImage(categoryId: string, imageId: string, input: UpdateImageInput) {
  await ensureImageExists(categoryId, imageId);
  return prisma.categoryImage.update({ where: { id: imageId }, data: input });
}

export async function deleteImage(categoryId: string, imageId: string) {
  const image = await ensureImageExists(categoryId, imageId);
  await prisma.categoryImage.delete({ where: { id: imageId } });
  await cleanupCatalogImageIfOrphaned(image.fileId);
}

async function ensureCategoryExists(id: string) {
  const exists = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Category not found');
}

async function ensureImageExists(categoryId: string, imageId: string) {
  const img = await prisma.categoryImage.findUnique({
    where: { id: imageId },
    select: { categoryID: true, fileId: true },
  });
  if (!img || img.categoryID !== categoryId) {
    throw new AppError('NOT_FOUND', 'Category image not found');
  }
  return img;
}

function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return new AppError('CONFLICT', 'A category with this slug already exists');
    if (e.code === 'P2003' || e.code === 'P2025') {
      return new AppError('NOT_FOUND', 'Referenced record not found');
    }
  }
  return e as Error;
}
