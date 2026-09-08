-- Multi-location "Visit us": replace the singleton store-info columns on
-- `sitesetting` with a `storelocation` table, and re-parent `storehours` from
-- the setting to a location. Any existing singleton store info is folded into
-- one location so nothing already entered is lost.

-- CreateTable
CREATE TABLE "storelocation" (
    "id" UUID NOT NULL,
    "settingID" INTEGER NOT NULL,
    "nameEn" TEXT,
    "nameAr" TEXT,
    "addressEn" TEXT,
    "addressAr" TEXT,
    "mapUrl" TEXT,
    "imageUrl" TEXT,
    "imageFileId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "storelocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storelocation_settingID_idx" ON "storelocation"("settingID");

-- AddForeignKey
ALTER TABLE "storelocation" ADD CONSTRAINT "storelocation_settingID_fkey" FOREIGN KEY ("settingID") REFERENCES "sitesetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: fold any singleton store info (address / map / image / existing hours)
-- into a single location per setting row.
INSERT INTO "storelocation" ("id", "settingID", "addressEn", "addressAr", "mapUrl", "imageUrl", "imageFileId", "sortOrder")
SELECT gen_random_uuid(), s."id", s."storeAddressEn", s."storeAddressAr", s."storeMapUrl", s."storeInfoImageUrl", s."storeInfoImageFileId", 0
FROM "sitesetting" s
WHERE s."storeAddressEn" IS NOT NULL
   OR s."storeAddressAr" IS NOT NULL
   OR s."storeMapUrl" IS NOT NULL
   OR s."storeInfoImageUrl" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "storehours" h WHERE h."settingID" = s."id");

-- Re-parent storehours: setting -> location.
ALTER TABLE "storehours" DROP CONSTRAINT "storehours_settingID_fkey";
DROP INDEX "storehours_settingID_dayOfWeek_key";
DROP INDEX "storehours_settingID_idx";

ALTER TABLE "storehours" ADD COLUMN "locationID" UUID;

UPDATE "storehours" h
SET "locationID" = l."id"
FROM "storelocation" l
WHERE l."settingID" = h."settingID";

-- Any hours row without a matching location can't satisfy the NOT NULL below.
DELETE FROM "storehours" WHERE "locationID" IS NULL;

ALTER TABLE "storehours" ALTER COLUMN "locationID" SET NOT NULL;
ALTER TABLE "storehours" DROP COLUMN "settingID";

-- CreateIndex
CREATE INDEX "storehours_locationID_idx" ON "storehours"("locationID");

-- CreateIndex
CREATE UNIQUE INDEX "storehours_locationID_dayOfWeek_key" ON "storehours"("locationID", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "storehours" ADD CONSTRAINT "storehours_locationID_fkey" FOREIGN KEY ("locationID") REFERENCES "storelocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the old singleton store-info columns.
ALTER TABLE "sitesetting" DROP COLUMN "storeAddressEn",
DROP COLUMN "storeAddressAr",
DROP COLUMN "storeMapUrl",
DROP COLUMN "storeInfoImageUrl",
DROP COLUMN "storeInfoImageFileId";
