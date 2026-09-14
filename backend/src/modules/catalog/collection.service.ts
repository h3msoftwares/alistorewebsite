import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createCollectionSchema, updateCollectionSchema, setCollectionRulesSchema } from './collection.schema';
import type { CreateImageInput, UpdateImageInput } from './image.schema';
import { cleanupCatalogImageIfOrphaned } from './image-cleanup.service';
import { collectionMembershipFilter, evaluateCollectionRules } from './collection-rules';

type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
type SetCollectionRulesInput = z.infer<typeof setCollectionRulesSchema>;

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

  const collections = await prisma.collection.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
    include: {
      images: imageOrder,
      // Correct as-is for MANUAL (membership: INCLUDE rows are the whole
      // story). For AUTOMATED/HYBRID this is just a placeholder — those
      // types' real membership comes from their rules, not this join table
      // (an AUTOMATED collection has no rows here at all by design), so it's
      // overridden below rather than shown to the admin as-is.
      _count: { select: { products: { where: { membership: 'INCLUDE' } } } },
    },
  });

  const ruleBased = collections.filter((c) => c.type !== 'MANUAL');
  const ruleCounts = await Promise.all(
    ruleBased.map((c) =>
      collectionMembershipFilter(c).then((filter) =>
        prisma.product.count({ where: { isActive: true, deletedAt: null, ...filter } })
      )
    )
  );
  const countByID = new Map(ruleBased.map((c, i) => [c.id, ruleCounts[i]]));

  return collections.map((c) =>
    countByID.has(c.id) ? { ...c, _count: { products: countByID.get(c.id)! } } : c
  );
}

export async function getCollectionById(id: string) {
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      images: imageOrder,
      // The admin edit form needs this to show/edit an AUTOMATED/HYBRID
      // collection's existing rules — same ordering setCollectionRules()
      // writes them in (group, then position within the group).
      rules: { orderBy: [{ groupNumber: 'asc' }, { sortOrder: 'asc' }] },
    },
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

/** A collection's live product listing. Collection membership is orthogonal
 *  to the category tree (see schema.prisma's Collection doc comment) — a
 *  product's own active/archived state and category reachability still gate
 *  whether it shows up here; this only adds the membership filter, which
 *  depends on the collection's `type` (see collection-rules.ts):
 *   - MANUAL    → CollectionProduct rows, in `sortOrder`.
 *   - AUTOMATED → CollectionRule evaluation only.
 *   - HYBRID    → rules plus manual INCLUDE, minus manual EXCLUDE. */
export async function listCollectionProducts(id: string) {
  const collection = await getCollectionById(id);
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    deletedAt: null,
    ...(await collectionMembershipFilter(collection)),
  };

  if (collection.type === 'MANUAL') {
    // Manual order is meaningful (the admin's own curation order) —
    // AUTOMATED/HYBRID have no such ordering, so those fall back to newest.
    const links = await prisma.collectionProduct.findMany({
      where: { collectionID: id, membership: 'INCLUDE', product: where },
      orderBy: { sortOrder: 'asc' },
      include: { product: { include: { images: imageOrder, variants: true } } },
    });
    return links.map((l) => l.product);
  }

  return prisma.product.findMany({
    where,
    orderBy: [{ dateCreated: 'desc' }, { id: 'asc' }],
    include: { images: imageOrder, variants: true },
  });
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
// empty of products (images cascade + get cleaned up from ImageKit). "Empty"
// is checked via the same membership filter listCollectionProducts() uses,
// not a raw CollectionProduct count — for an AUTOMATED/HYBRID collection,
// the rules themselves can still be matching live products even with zero
// manual rows.
export async function deleteCollection(id: string) {
  const existing = await prisma.collection.findUnique({ where: { id }, select: { archivedAt: true, type: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Collection not found');
  if (!existing.archivedAt) {
    throw new AppError('CONFLICT', 'Archive the collection before deleting it permanently.');
  }
  const where = await collectionMembershipFilter({ id, type: existing.type });
  const productCount = await prisma.product.count({ where });
  if (productCount > 0) {
    throw new AppError(
      'CONFLICT',
      `Cannot delete a collection that still has ${productCount} product(s). Move or remove them first.`
    );
  }
  const images = await prisma.collectionImage.findMany({ where: { collectionID: id }, select: { fileId: true } });
  // CollectionRule cascades automatically (onDelete: Cascade).
  await prisma.collection.delete({ where: { id } });
  await Promise.all(images.map((img) => cleanupCatalogImageIfOrphaned(img.fileId)));
}

// Replace the collection's manual product membership wholesale — same
// "replace-all on save" convention used elsewhere in this codebase.
// MANUAL: these become the collection's entire membership (INCLUDE).
// HYBRID: these overlay INCLUDE on top of the rule-computed set. Meaningless
// for AUTOMATED (rules alone decide membership) — rejected outright rather
// than silently accepted and ignored.
export async function setCollectionProducts(id: string, productIds: string[]) {
  const collection = await getCollectionById(id);
  if (collection.type === 'AUTOMATED') {
    throw new AppError(
      'CONFLICT',
      'An automated collection’s membership comes from its rules — set its type to HYBRID to also pick products manually.'
    );
  }
  const unique = [...new Set(productIds)];
  const found = await prisma.product.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length) {
    throw new AppError('NOT_FOUND', 'One or more products were not found');
  }
  await prisma.$transaction([
    prisma.collectionProduct.deleteMany({ where: { collectionID: id } }),
    prisma.collectionProduct.createMany({
      data: unique.map((productID, i) => ({ collectionID: id, productID, sortOrder: i, membership: 'INCLUDE' })),
    }),
  ]);
  return getCollectionById(id);
}

// Replace the collection's rules wholesale — same "replace-all on save"
// convention. Meaningless for a MANUAL collection (rules are never
// evaluated) — rejected outright for the same reason as above.
export async function setCollectionRules(id: string, rules: SetCollectionRulesInput['rules']) {
  const collection = await getCollectionById(id);
  if (collection.type === 'MANUAL') {
    throw new AppError(
      'CONFLICT',
      'A manual collection’s membership is picked by hand — set its type to AUTOMATED or HYBRID to use rules.'
    );
  }
  await prisma.$transaction([
    prisma.collectionRule.deleteMany({ where: { collectionID: id } }),
    prisma.collectionRule.createMany({
      data: rules.map((r, i) => ({
        collectionID: id,
        groupNumber: r.groupNumber,
        field: r.field,
        operator: r.operator,
        value: r.value ?? Prisma.JsonNull,
        sortOrder: i,
      })),
    }),
  ]);
  return getCollectionById(id);
}

export interface CollectionRulesPreview {
  count: number;
  sample: { id: string; nameEn: string; nameAr: string; sku: string }[];
}

/** "Which live products would this (possibly still-unsaved) rule set match"
 *  — the rule editor calls this on demand so an admin can see the effect of
 *  a change before committing to Save Rules. */
export async function previewCollectionRules(rules: SetCollectionRulesInput['rules']): Promise<CollectionRulesPreview> {
  const ruleFilter = await evaluateCollectionRules(
    rules.map((r) => ({ ...r, value: (r.value ?? null) as Prisma.JsonValue }))
  );
  const where: Prisma.ProductWhereInput = { isActive: true, deletedAt: null, ...ruleFilter };
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
