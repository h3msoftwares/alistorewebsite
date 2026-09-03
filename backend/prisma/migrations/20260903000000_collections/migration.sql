-- Replace the fixed `Department` enum with an owner-editable `collection` table.
-- Hierarchy is now Collection -> Category -> Product. `collectionID` is also
-- denormalized onto `product` (mirrors how `department` was denormalized).
--
-- This migration backfills existing rows: one collection per old enum value,
-- then repoints every category/product before dropping `department`.

-- CreateTable
CREATE TABLE "collection" (
    "id" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_slug_key" ON "collection"("slug");

-- CreateIndex
CREATE INDEX "collection_isActive_idx" ON "collection"("isActive");

-- Backfill: seed one collection per legacy Department value (fixed UUIDs so
-- re-runs / other environments line up; matches prisma/seed.ts slugs).
INSERT INTO "collection" ("id", "nameEn", "nameAr", "slug", "sortOrder") VALUES
    ('00000000-0000-4000-8000-000000000001', 'Women', 'نساء', 'women', 1),
    ('00000000-0000-4000-8000-000000000002', 'Men',   'رجال', 'men',   2),
    ('00000000-0000-4000-8000-000000000003', 'Kids',  'أطفال', 'kids',  3);

-- AlterTable: add nullable FK columns first, backfill, then enforce NOT NULL.
ALTER TABLE "category" ADD COLUMN "collectionID" UUID;
ALTER TABLE "product"  ADD COLUMN "collectionID" UUID;

UPDATE "category" SET "collectionID" = '00000000-0000-4000-8000-000000000001' WHERE "department" = 'WOMEN';
UPDATE "category" SET "collectionID" = '00000000-0000-4000-8000-000000000002' WHERE "department" = 'MEN';
UPDATE "category" SET "collectionID" = '00000000-0000-4000-8000-000000000003' WHERE "department" = 'KIDS';

UPDATE "product" SET "collectionID" = '00000000-0000-4000-8000-000000000001' WHERE "department" = 'WOMEN';
UPDATE "product" SET "collectionID" = '00000000-0000-4000-8000-000000000002' WHERE "department" = 'MEN';
UPDATE "product" SET "collectionID" = '00000000-0000-4000-8000-000000000003' WHERE "department" = 'KIDS';

ALTER TABLE "category" ALTER COLUMN "collectionID" SET NOT NULL;
ALTER TABLE "product"  ALTER COLUMN "collectionID" SET NOT NULL;

-- DropIndex
DROP INDEX "category_department_idx";
DROP INDEX "product_department_idx";

-- AlterTable: drop the legacy enum column
ALTER TABLE "category" DROP COLUMN "department";
ALTER TABLE "product"  DROP COLUMN "department";

-- DropEnum
DROP TYPE "Department";

-- CreateIndex
CREATE INDEX "category_collectionID_idx" ON "category"("collectionID");

-- CreateIndex
CREATE INDEX "product_collectionID_idx" ON "product"("collectionID");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
