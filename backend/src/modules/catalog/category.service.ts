import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createCategorySchema, updateCategorySchema } from './category.schema';
import type { listProductsQuerySchema } from './product.schema';
import { listProducts } from './product.service';
import type { CreateImageInput, UpdateImageInput } from './image.schema';

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Same ordering ProductImage uses — the lowest-sortOrder row is the "base" image.
const imageOrder = { orderBy: { sortOrder: 'asc' as const } };

const categoryInclude = {
  images: imageOrder,
  // `collection` is null for a standalone category.
  collection: {
    select: { id: true, nameEn: true, nameAr: true, slug: true, accentColor: true },
  },
  children: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
    include: { images: imageOrder },
  },
};

interface ListCategoriesOpts {
  collectionId?: string;
  /** Only categories not attached to any collection. */
  standalone?: boolean;
  /** Only categories promoted to their own home-page row (any collection). */
  showOnHome?: boolean;
}

export async function listCategories(opts: ListCategoriesOpts = {}) {
  const { collectionId, standalone, showOnHome } = opts;
  return prisma.category.findMany({
    where: {
      isActive: true,
      ...(collectionId ? { collectionID: collectionId } : {}),
      ...(standalone ? { collectionID: null } : {}),
      ...(showOnHome ? { showOnHome: true } : {}),
    },
    orderBy: { sortOrder: 'asc' },
    include: categoryInclude,
  });
}

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({ where: { id }, include: categoryInclude });
  if (!category) throw new AppError('NOT_FOUND', 'Category not found');
  return category;
}

export async function getCategoryBySlug(slug: string) {
  const category = await prisma.category.findUnique({ where: { slug }, include: categoryInclude });
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

export async function deleteCategory(id: string) {
  await ensureCategoryExists(id);
  const productCount = await prisma.product.count({ where: { categoryID: id } });
  if (productCount > 0) {
    throw new AppError(
      'CONFLICT',
      `Cannot delete a category that still has ${productCount} product(s).`
    );
  }
  await prisma.category.delete({ where: { id } });
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
  await ensureImageExists(categoryId, imageId);
  await prisma.categoryImage.delete({ where: { id: imageId } });
}

async function ensureCategoryExists(id: string) {
  const exists = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Category not found');
}

async function ensureImageExists(categoryId: string, imageId: string) {
  const img = await prisma.categoryImage.findUnique({
    where: { id: imageId },
    select: { categoryID: true },
  });
  if (!img || img.categoryID !== categoryId) {
    throw new AppError('NOT_FOUND', 'Category image not found');
  }
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
