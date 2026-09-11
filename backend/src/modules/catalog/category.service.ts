import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createCategorySchema, updateCategorySchema } from './category.schema';
import type { listProductsQuerySchema } from './product.schema';
import { listProducts } from './product.service';
import type { CreateImageInput, UpdateImageInput } from './image.schema';
import { cleanupCatalogImageIfOrphaned } from './image-cleanup.service';

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Same ordering ProductImage uses — the lowest-sortOrder row is the "base" image.
const imageOrder = { orderBy: { sortOrder: 'asc' as const } };

const categoryInclude = {
  images: imageOrder,
  // `collection` is null for a standalone category. `archivedAt` included so
  // admin pickers can flag "this category's parent collection is archived"
  // (fix-list.md #15, resolves 12.2) — previously not selected at all, so
  // that state was invisible to the frontend regardless of what it tried to
  // do with it.
  collection: {
    select: { id: true, nameEn: true, nameAr: true, slug: true, accentColor: true, archivedAt: true },
  },
  children: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
    include: { images: imageOrder },
  },
};

export type CatalogStatus = 'active' | 'archived' | 'all';

interface ListCategoriesOpts {
  collectionId?: string;
  /** Only categories not attached to any collection. */
  standalone?: boolean;
  /** Only categories promoted to their own home-page row (any collection). */
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

export async function listCategories(opts: ListCategoriesOpts = {}) {
  const { collectionId, standalone, showOnHome } = opts;
  const where: Prisma.CategoryWhereInput = {
    ...statusWhere(opts.status ?? 'active'),
    ...(collectionId ? { collectionID: collectionId } : {}),
    ...(standalone ? { collectionID: null } : {}),
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

  return prisma.category.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
    include: categoryInclude,
  });
}

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({ where: { id }, include: categoryInclude });
  if (!category) throw new AppError('NOT_FOUND', 'Category not found');
  return category;
}

// Public storefront lookup — same "active" gate as getCollectionBySlug, for
// the same reason (fix-list.md #8, resolves 12.1). Previously unfiltered, so
// an archived category's direct slug URL stayed fully live.
export async function getCategoryBySlug(slug: string) {
  const category = await prisma.category.findFirst({
    where: { slug, ...statusWhere('active') },
    include: categoryInclude,
  });
  if (!category) throw new AppError('NOT_FOUND', 'Category not found');
  return category;
}

// Products preview for a category — the same shaped, paginated list
// `GET /api/products` returns (with effectivePrice / onSale), scoped to this
// category. Mirrors how a collection's products are listed.
export async function listCategoryProducts(id: string, query: ListProductsQuery) {
  await ensureCategoryExists(id);
  return listProducts({ ...query, categoryId: id });
}

// ---- Admin-side writes ----

export async function createCategory(input: CreateCategoryInput) {
  const { collectionId, parentCategoryId, ...rest } = input;
  if (collectionId) await ensureCollectionExists(collectionId);
  try {
    return await prisma.category.create({
      data: {
        ...rest,
        ...(collectionId ? { collection: { connect: { id: collectionId } } } : {}),
        ...(parentCategoryId ? { parent: { connect: { id: parentCategoryId } } } : {}),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await ensureCategoryExists(id);
  const { collectionId, parentCategoryId, ...rest } = input;
  if (collectionId) await ensureCollectionExists(collectionId);

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...rest,
        // undefined ⇒ leave as-is; null ⇒ detach; id ⇒ (re)link.
        ...(collectionId === undefined
          ? {}
          : collectionId === null
            ? { collection: { disconnect: true } }
            : { collection: { connect: { id: collectionId } } }),
        ...(parentCategoryId !== undefined
          ? parentCategoryId
            ? { parent: { connect: { id: parentCategoryId } } }
            : { parent: { disconnect: true } }
          : {}),
      },
    });

    // Keep the denormalized Product.collectionID mirror in sync when this
    // category's collection changed.
    if (collectionId !== undefined) {
      await prisma.product.updateMany({
        where: { categoryID: id },
        data: { collectionID: collectionId ?? null },
      });
    }

    return updated;
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Admin's primary "remove" — hidden from the storefront, kept + restorable.
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

// Permanent, irreversible — only once the category is archived AND empty.
export async function deleteCategory(id: string) {
  const existing = await prisma.category.findUnique({ where: { id }, select: { archivedAt: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Category not found');
  if (!existing.archivedAt) {
    throw new AppError('CONFLICT', 'Archive the category before deleting it permanently.');
  }
  const productCount = await prisma.product.count({ where: { categoryID: id } });
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

async function ensureCollectionExists(id: string) {
  const exists = await prisma.collection.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Collection not found');
}

function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError('CONFLICT', 'A category with this slug already exists');
  }
  return e as Error;
}
