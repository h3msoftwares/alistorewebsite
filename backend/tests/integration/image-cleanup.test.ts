import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';
import { cleanupCatalogImageIfOrphaned } from '../../src/modules/catalog/image-cleanup.service';

vi.mock('../../src/modules/uploads/upload.service', () => ({
  deleteImageKitFile: vi.fn(),
}));
import { deleteImageKitFile } from '../../src/modules/uploads/upload.service';

describe('cleanupCatalogImageIfOrphaned', () => {
  beforeEach(() => {
    vi.mocked(deleteImageKitFile).mockClear();
  });

  it('does nothing for a null/undefined fileId (pre-migration rows never had one)', async () => {
    await cleanupCatalogImageIfOrphaned(null);
    await cleanupCatalogImageIfOrphaned(undefined);
    expect(deleteImageKitFile).not.toHaveBeenCalled();
  });

  it('deletes the ImageKit file once no catalog image row references it any more', async () => {
    // Simulates the caller's own sequence: the DB row is already gone by the
    // time cleanup runs (a plain delete, or a cascade from a parent delete).
    await cleanupCatalogImageIfOrphaned('shared-file-1');
    expect(deleteImageKitFile).toHaveBeenCalledWith('shared-file-1');
  });

  it('does not delete the ImageKit file while another row still references the same fileId', async () => {
    const col = await makeCollection();
    const cat = await makeCategory();
    await prisma.categoryImage.create({
      data: { categoryID: cat.id, url: 'https://ik.imagekit.io/demo/x.jpg', fileId: 'shared-file-2' },
    });

    await cleanupCatalogImageIfOrphaned('shared-file-2');

    expect(deleteImageKitFile).not.toHaveBeenCalled();
  });

  it('checks across all three catalog tables, not just one', async () => {
    const col = await makeCollection();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    await prisma.productImage.create({
      data: { productID: product.id, url: 'https://ik.imagekit.io/demo/y.jpg', fileId: 'shared-file-3' },
    });

    // Still referenced by the ProductImage row above, even though nothing in
    // CollectionImage/CategoryImage points at it.
    await cleanupCatalogImageIfOrphaned('shared-file-3');
    expect(deleteImageKitFile).not.toHaveBeenCalled();

    await prisma.productImage.deleteMany({ where: { fileId: 'shared-file-3' } });
    await cleanupCatalogImageIfOrphaned('shared-file-3');
    expect(deleteImageKitFile).toHaveBeenCalledWith('shared-file-3');
  });
});
