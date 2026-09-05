-- Track the ImageKit fileId behind each catalog image so we can delete the
-- underlying asset (not just the DB row) when an image is removed. Nullable
-- and unbackfilled: existing rows only ever stored a URL, so their fileId is
-- unknown and they're simply left alone by the new cleanup logic.
ALTER TABLE "collectionimage" ADD COLUMN "fileId" TEXT;
ALTER TABLE "categoryimage" ADD COLUMN "fileId" TEXT;
ALTER TABLE "productimage" ADD COLUMN "fileId" TEXT;
