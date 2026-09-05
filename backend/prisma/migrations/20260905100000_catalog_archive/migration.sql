-- Archive support for collections and categories: the admin's primary
-- "remove" action sets archivedAt (hidden from the storefront, kept in the
-- DB, restorable). Permanent delete stays available only once a record is
-- archived and empty. Products already have deletedAt for this purpose.
ALTER TABLE "collection" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "category" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "collection_archivedAt_idx" ON "collection"("archivedAt");
CREATE INDEX "category_archivedAt_idx" ON "category"("archivedAt");
