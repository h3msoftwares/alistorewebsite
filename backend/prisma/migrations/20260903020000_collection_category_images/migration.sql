-- Give Collection and Category a gallery-style image table, modelled exactly
-- on ProductImage (url + bilingual alt + sortOrder, cascade-deleted with the
-- parent, FK indexed). The old inline `collection.imageUrl` column is dropped
-- (it was always NULL — the seed never set it).

-- AlterTable
ALTER TABLE "collection" DROP COLUMN "imageUrl";

-- CreateTable
CREATE TABLE "collectionimage" (
    "id" UUID NOT NULL,
    "collectionID" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "altEn" TEXT,
    "altAr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collectionimage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoryimage" (
    "id" UUID NOT NULL,
    "categoryID" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "altEn" TEXT,
    "altAr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categoryimage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collectionimage_collectionID_idx" ON "collectionimage"("collectionID");

-- CreateIndex
CREATE INDEX "categoryimage_categoryID_idx" ON "categoryimage"("categoryID");

-- AddForeignKey
ALTER TABLE "collectionimage" ADD CONSTRAINT "collectionimage_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoryimage" ADD CONSTRAINT "categoryimage_categoryID_fkey" FOREIGN KEY ("categoryID") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
