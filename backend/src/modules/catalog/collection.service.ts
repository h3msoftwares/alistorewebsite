import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createCollectionSchema, updateCollectionSchema } from './collection.schema';

type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

// Same ordering ProductImage uses — the row with the lowest sortOrder is the
// "base" image.
const imageOrder = { orderBy: { sortOrder: 'asc' as const } };

const categoryTree = {
  where: { isActive: true },
  orderBy: { sortOrder: 'asc' as const },
  include: { images: imageOrder },
};

export async function listCollections(includeInactive = false) {
  return prisma.collection.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      images: imageOrder,
      _count: { select: { categories: true, products: true } },
    },
  });
}

export async function getCollectionById(id: string) {
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: { images: imageOrder, categories: categoryTree },
  });
  if (!collection) throw new AppError('NOT_FOUND', 'Collection not found');
  return collection;
}

export async function getCollectionBySlug(slug: string) {
  const collection = await prisma.collection.findUnique({
    where: { slug },
    include: { images: imageOrder, categories: categoryTree },
  });
  if (!collection) throw new AppError('NOT_FOUND', 'Collection not found');
  return collection;
}

// ---- Admin-side writes ----

export async function createCollection(input: CreateCollectionInput) {
  const { categoryIds, ...data } = input;
  try {
    return await prisma.collection.create({
      data: {
        ...data,
        ...(categoryIds?.length
          ? { categories: { connect: categoryIds.map((id) => ({ id })) } }
          : {}),
      },
      include: { images: imageOrder, categories: categoryTree },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('CONFLICT', 'A collection with this slug already exists');
    }
    throw e;
  }
}

export async function updateCollection(id: string, input: UpdateCollectionInput) {
  await ensureExists(id);
  try {
    return await prisma.collection.update({
      where: { id },
      data: input,
      include: { images: imageOrder, categories: categoryTree },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('CONFLICT', 'A collection with this slug already exists');
    }
    throw e;
  }
}

export async function deleteCollection(id: string) {
  await ensureExists(id);
  const productCount = await prisma.product.count({ where: { collectionID: id } });
  if (productCount > 0) {
    throw new AppError(
      'CONFLICT',
      `Cannot delete a collection that still has ${productCount} product(s). Move or remove them first.`
    );
  }
  // Categories cascade-delete via the schema relation.
  await prisma.collection.delete({ where: { id } });
}

// Link (move) existing categories into this collection.
export async function linkCategories(id: string, categoryIds: string[]) {
  await ensureExists(id);
  const found = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true },
  });
  if (found.length !== categoryIds.length) {
    throw new AppError('NOT_FOUND', 'One or more categories were not found');
  }
  await prisma.category.updateMany({
    where: { id: { in: categoryIds } },
    data: { collectionID: id },
  });
  return getCollectionById(id);
}

async function ensureExists(id: string) {
  const exists = await prisma.collection.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Collection not found');
}
