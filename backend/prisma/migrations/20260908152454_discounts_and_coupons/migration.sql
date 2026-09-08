-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('ALL', 'COLLECTION', 'CATEGORY');

-- CreateEnum
CREATE TYPE "DiscountStacking" AS ENUM ('STACK', 'OVERRIDE');

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "discount" (
    "id" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "collectionID" UUID,
    "categoryID" UUID,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "stacking" "DiscountStacking" NOT NULL DEFAULT 'STACK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discount_scope_idx" ON "discount"("scope");

-- CreateIndex
CREATE INDEX "discount_collectionID_idx" ON "discount"("collectionID");

-- CreateIndex
CREATE INDEX "discount_categoryID_idx" ON "discount"("categoryID");

-- CreateIndex
CREATE INDEX "discount_isActive_idx" ON "discount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_key" ON "coupon"("code");

-- AddForeignKey
ALTER TABLE "discount" ADD CONSTRAINT "discount_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount" ADD CONSTRAINT "discount_categoryID_fkey" FOREIGN KEY ("categoryID") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
