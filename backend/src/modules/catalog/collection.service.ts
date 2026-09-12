import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createCollectionSchema, updateCollectionSchema } from './collection.schema';
import type { CreateImageInput, UpdateImageInput } from './image.schema';
import { cleanupCatalogImageIfOrphaned } from './image-cleanup.service';

type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

// Same ordering ProductImage uses — the row with the lowest sortOrder is the
// "base" image.
const imageOrder = { orderBy: { sortOrder: 'asc' as const } };

export type CatalogStatus = 'active' | 'archived' | 'all';

export interface ListCollectionsOpts {
  search?: string;
  status?: CatalogStatus;
}

// `active` = live on the storefront (not archived, still isActive);
// `archived` = archived only; `all` = both. Non-active is admin-only — the
// controller gates it.
function statusWhere(status: CatalogStatus): Prisma.CollectionWhereInput {
  if (status === 'archived') return { archivedAt: { not: null } };
  if (status === 'all') return {};
  return { archivedAt: null, isActive: true };
}

export async function listCollections(opts: ListCollectionsOpts = {}) {
  const where: Prisma.CollectionWhereInput = {
    ...statusWhere(opts.status ?? 'active'),
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

  return prisma.collection.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
    include: {
      images: imageOrder,
      _count: { select: { products: true } },
    },
  });
}

export async function getCollectionById(id: string) {
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: { images: imageOrder },
  });
  if (!collection) throw new AppError('NOT_FOUND', 'Collection not found');
  return collection;
}

// Public storefront lookup — unlike getCollectionById (admin-only, used by
// the edit form), this is what /[locale]/[collection] resolves through, so
// it must respect the same "active" gate listCollections() defaults to.
// Previously had none at all: an archived (or merely inactive) collection's
// direct slug URL stayed fully live, the one reachability path the admin's
// "archive" action doesn't actually close (fix-list.md #8, resolves 12.1).
export async function getCollectionBySlug(slug: string) {
  const collection = await prisma.collection.findFirst({
    where: { slug, ...statusWhere('active') },
    include: { images: imageOrder },
  });
  if (!collection) throw new AppError('NOT_FOUND', 'Collection not found');
  return collection;
}

/** A manually-curated collection's live product listing, newest-linked
 *  first. Collection membership is orthogonal to the category tree (see
 *  schema.prisma's Collection doc comment) — a product's own active/archived
 *  state and category reachability still gate whether it shows up here;
 *  this only adds the "is manually placed in this collection" filter. */
export async function listCollectionProducts(id: string) {
  await ensureExists(id);
  const links = await prisma.collectionProduct.findMany({
    where: { collectionID: id, product: { isActive: true, deletedAt: null } },
    orderBy: { sortOrder: 'asc' },
    include: {
      product: {
        include: { images: imageOrder, variants: true },
      },
    },
  });
  return links.map((l) => l.product);
}

// ---- Admin-side writes ----

export async function createCollection(input: CreateCollectionInput) {
  try {
    return await prisma.collection.create({
      data: input,
      include: { images: imageOrder },
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
      include: { images: imageOrder },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('CONFLICT', 'A collection with this slug already exists');
    }
    throw e;
  }
}

// The admin's primary "remove" action — hides the collection from the
// storefront but keeps every row, so it can be restored.
export async function archiveCollection(id: string) {
  await ensureExists(id);
  return prisma.collection.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
    include: { images: imageOrder },
  });
}

export async function restoreCollection(id: string) {
  await ensureExists(id);
  return prisma.collection.update({
    where: { id },
    data: { archivedAt: null, isActive: true },
    include: { images: imageOrder },
  });
}

// Permanent, irreversible delete — only once the collection is archived AND
// empty of products (images cascade + get cleaned up from ImageKit).
export async function deleteCollection(id: string) {
  const existing = await prisma.collection.findUnique({ where: { id }, select: { archivedAt: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Collection not found');
  if (!existing.archivedAt) {
    throw new AppError('CONFLICT', 'Archive the collection before deleting it permanently.');
  }
  const productCount = await prisma.collectionProduct.count({ where: { collectionID: id } });
  if (productCount > 0) {
    throw new AppError(
      'CONFLICT',
      `Cannot delete a collection that still has ${productCount} product(s). Move or remove them first.`
    );
  }
  const images = await prisma.collectionImage.findMany({ where: { collectionID: id }, select: { fileId: true } });
  await prisma.collection.delete({ where: { id } });
  await Promise.all(images.map((img) => cleanupCatalogImageIfOrphaned(img.fileId)));
}

// Replace the collection's manual product membership wholesale — same
// "replace-all on save" convention used elsewhere in this codebase.
export async function setCollectionProducts(id: string, productIds: string[]) {
  await ensureExists(id);
  const unique = [...new Set(productIds)];
  const found = await prisma.product.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length) {
    throw new AppError('NOT_FOUND', 'One or more products were not found');
  }
  await prisma.$transaction([
    prisma.collectionProduct.deleteMany({ where: { collectionID: id } }),
    prisma.collectionProduct.createMany({
      data: unique.map((productID, i) => ({ collectionID: id, productID, sortOrder: i })),
    }),
  ]);
  return getCollectionById(id);
}

// ---- Images (sub-resource) ----

export async function addImage(collectionId: string, input: CreateImageInput) {
  await ensureExists(collectionId);
  return prisma.collectionImage.create({ data: { collectionID: collectionId, ...input } });
}

export async function updateImage(
  collectionId: string,
  imageId: string,
  input: UpdateImageInput
) {
  await ensureImageExists(collectionId, imageId);
  return prisma.collectionImage.update({ where: { id: imageId }, data: input });
}

export async function deleteImage(collectionId: string, imageId: string) {
  const image = await ensureImageExists(collectionId, imageId);
  await prisma.collectionImage.delete({ where: { id: imageId } });
  await cleanupCatalogImageIfOrphaned(image.fileId);
}

async function ensureExists(id: string) {
  const exists = await prisma.collection.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Collection not found');
}

async function ensureImageExists(collectionId: string, imageId: string) {
  const img = await prisma.collectionImage.findUnique({
    where: { id: imageId },
    select: { collectionID: true, fileId: true },
  });
  if (!img || img.collectionID !== collectionId) {
    throw new AppError('NOT_FOUND', 'Collection image not found');
  }
  return img;
}
