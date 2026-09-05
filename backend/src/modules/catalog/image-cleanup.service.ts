import { prisma } from '../../config/prisma';
import { deleteImageKitFile } from '../uploads/upload.service';

/**
 * Deletes the ImageKit asset behind a removed catalog image row, unless the
 * same fileId is still referenced by another Product/Category/Collection
 * image row. Normal uploads always produce a unique file (ImageKit's
 * `useUniqueFileName`), so in practice this is a defensive check, not the
 * common case — but nothing in the schema stops the same fileId from being
 * stored on more than one row, so we don't delete out from under a sibling
 * reference. Call this AFTER the DB row(s) referencing `fileId` are gone
 * (a plain delete, or a cascade from deleting the parent product/category/
 * collection) so the count below reflects what's actually left.
 */
export async function cleanupCatalogImageIfOrphaned(fileId: string | null | undefined): Promise<void> {
  if (!fileId) return; // pre-migration rows never had a known fileId — nothing to clean up.

  const [productCount, categoryCount, collectionCount] = await Promise.all([
    prisma.productImage.count({ where: { fileId } }),
    prisma.categoryImage.count({ where: { fileId } }),
    prisma.collectionImage.count({ where: { fileId } }),
  ]);
  if (productCount + categoryCount + collectionCount > 0) return;

  await deleteImageKitFile(fileId);
}
