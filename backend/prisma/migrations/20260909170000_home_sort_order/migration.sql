-- Dedicated home-page ordering key, separate from `sortOrder` (which stays the
-- nav position for collections and the sibling order for categories). Backfill
-- from the current sortOrder so existing home ordering carries over.
ALTER TABLE "collection" ADD COLUMN "homeSortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "category" ADD COLUMN "homeSortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "collection" SET "homeSortOrder" = "sortOrder";
UPDATE "category" SET "homeSortOrder" = "sortOrder";
