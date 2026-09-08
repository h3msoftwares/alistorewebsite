-- Optional "Our story" page copy on the settings singleton, plus a
-- `reviewimage` table for the admin-uploaded customer-review strip.

-- AlterTable
ALTER TABLE "sitesetting" ADD COLUMN     "storyBodyAr" TEXT,
ADD COLUMN     "storyBodyEn" TEXT,
ADD COLUMN     "storyTitleAr" TEXT,
ADD COLUMN     "storyTitleEn" TEXT;

-- CreateTable
CREATE TABLE "reviewimage" (
    "id" UUID NOT NULL,
    "settingID" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageFileId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reviewimage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviewimage_settingID_idx" ON "reviewimage"("settingID");

-- AddForeignKey
ALTER TABLE "reviewimage" ADD CONSTRAINT "reviewimage_settingID_fkey" FOREIGN KEY ("settingID") REFERENCES "sitesetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
