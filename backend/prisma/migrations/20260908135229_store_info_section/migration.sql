-- AlterTable
ALTER TABLE "sitesetting" ADD COLUMN     "storeAddressAr" TEXT,
ADD COLUMN     "storeAddressEn" TEXT,
ADD COLUMN     "storeInfoImageFileId" TEXT,
ADD COLUMN     "storeInfoImageUrl" TEXT,
ADD COLUMN     "storeMapUrl" TEXT;

-- CreateTable
CREATE TABLE "storehours" (
    "id" UUID NOT NULL,
    "settingID" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,

    CONSTRAINT "storehours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storehours_settingID_idx" ON "storehours"("settingID");

-- CreateIndex
CREATE UNIQUE INDEX "storehours_settingID_dayOfWeek_key" ON "storehours"("settingID", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "storehours" ADD CONSTRAINT "storehours_settingID_fkey" FOREIGN KEY ("settingID") REFERENCES "sitesetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
