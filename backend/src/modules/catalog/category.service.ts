import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createCategorySchema, updateCategorySchema } from './category.schema';

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// Same ordering ProductImage uses — the lowest-sortOrder row is the "base" image.
const imageOrder = { orderBy: { sortOrder: 'asc' as const } };

export async function listCategories(collectionId?: string) {
  return prisma.category.findMany({
    where: { isActive: true, ...(collectionId ? { collectionID: collectionId } : {}) },
    orderBy: { sortOrder: 'asc' },
    include: {
      images: imageOrder,
      collection: { select: { id: true, nameEn: true, nameAr: true, slug: true } },
      children: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { images: imageOrder },
      },
    },
  });
}

// ---- Admin-side writes ----

export async function createCategory(input: CreateCategoryInput) {
  await ensureCollectionExists(input.collectionId);
  const { collectionId, parentCategoryId, ...rest } = input;
  try {
    return await prisma.category.create({
      data: {
        ...rest,
        collection: { connect: { id: collectionId } },
        ...(parentCategoryId ? { parent: { connect: { id: parentCategoryId } } } : {}),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await ensureCategoryExists(id);
  if (input.collectionId) await ensureCollectionExists(input.collectionId);

  const { collectionId, parentCategoryId, ...rest } = input;
  try {
    return await prisma.category.update({
      where: { id },
      data: {
        ...rest,
        ...(collectionId ? { collection: { connect: { id: collectionId } } } : {}),
        ...(parentCategoryId !== undefined
          ? parentCategoryId
            ? { parent: { connect: { id: parentCategoryId } } }
            : { parent: { disconnect: true } }
          : {}),
      },
    });
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

async function ensureCategoryExists(id: string) {
  const exists = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Category not found');
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
