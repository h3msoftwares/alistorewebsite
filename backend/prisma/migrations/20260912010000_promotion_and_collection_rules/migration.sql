-- Stage 2 of the catalog redesign (see catalog-redesign-implementation-plan.md
-- and robust-ecommerce-catalog-architecture.md at the repo root).
--
-- Replaces the single-scope `Discount` model outright with `Promotion` +
-- PromotionProduct/PromotionCategory/PromotionCollection (one promotion can
-- target any mix of products, categories — optionally including their
-- descendants via Category.path — and collections at once), and adds
-- `CollectionRule` for AUTOMATED/HYBRID collections (Collection.type,
-- CollectionProduct.membership). No backfill: zero `Discount` rows existed
-- anywhere in this repo (confirmed before writing this migration), so this
-- is a fresh migrate + reseed, same as Stage 1.

-- CreateEnum
CREATE TYPE "CollectionType" AS ENUM ('MANUAL', 'AUTOMATED', 'HYBRID');

-- CreateEnum
CREATE TYPE "CollectionMembership" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "CollectionRuleField" AS ENUM ('PRODUCT_STATUS', 'CATEGORY', 'PRICE', 'COMPARE_AT_PRICE', 'HAS_ACTIVE_PROMOTION', 'CREATED_AT', 'STOCK_STATUS');

-- CreateEnum
CREATE TYPE "CollectionRuleOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IN', 'NOT_IN', 'EXISTS');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- DropForeignKey
ALTER TABLE "discount" DROP CONSTRAINT "discount_categoryID_fkey";

-- DropForeignKey
ALTER TABLE "discount" DROP CONSTRAINT "discount_collectionID_fkey";

-- NOTE: the diff this migration started from also proposed dropping
-- "product_searchText_trgm_idx" and an `ALTER COLUMN "searchText" DROP
-- DEFAULT` — both are artifacts of the diff tool not modeling the raw-SQL
-- GENERATED ALWAYS ... STORED column (see migration
-- 20260909180000_product_search_text) or its GIN index, neither of which is
-- expressible in schema.prisma. Deliberately omitted, same as Stage 1's
-- migration — unrelated to this change.

-- AlterTable
ALTER TABLE "collection" ADD COLUMN     "type" "CollectionType" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "collectionproduct" ADD COLUMN     "membership" "CollectionMembership" NOT NULL DEFAULT 'INCLUDE';

-- DropTable
DROP TABLE "discount";

-- DropEnum
DROP TYPE "DiscountScope";

-- DropEnum
DROP TYPE "DiscountStacking";

-- CreateTable
CREATE TABLE "collectionrule" (
    "id" UUID NOT NULL,
    "collectionID" UUID NOT NULL,
    "groupNumber" INTEGER NOT NULL DEFAULT 0,
    "field" "CollectionRuleField" NOT NULL,
    "operator" "CollectionRuleOperator" NOT NULL,
    "value" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collectionrule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion" (
    "id" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotionproduct" (
    "promotionID" UUID NOT NULL,
    "productID" UUID NOT NULL,

    CONSTRAINT "promotionproduct_pkey" PRIMARY KEY ("promotionID","productID")
);

-- CreateTable
CREATE TABLE "promotioncategory" (
    "promotionID" UUID NOT NULL,
    "categoryID" UUID NOT NULL,
    "includeDescendants" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "promotioncategory_pkey" PRIMARY KEY ("promotionID","categoryID")
);

-- CreateTable
CREATE TABLE "promotioncollection" (
    "promotionID" UUID NOT NULL,
    "collectionID" UUID NOT NULL,

    CONSTRAINT "promotioncollection_pkey" PRIMARY KEY ("promotionID","collectionID")
);

-- CreateIndex
CREATE INDEX "collectionrule_collectionID_groupNumber_sortOrder_idx" ON "collectionrule"("collectionID", "groupNumber", "sortOrder");

-- CreateIndex
CREATE INDEX "promotion_status_idx" ON "promotion"("status");

-- CreateIndex
CREATE INDEX "promotion_startsAt_endsAt_idx" ON "promotion"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "promotionproduct_productID_idx" ON "promotionproduct"("productID");

-- CreateIndex
CREATE INDEX "promotioncategory_categoryID_idx" ON "promotioncategory"("categoryID");

-- CreateIndex
CREATE INDEX "promotioncollection_collectionID_idx" ON "promotioncollection"("collectionID");

-- AddForeignKey
ALTER TABLE "collectionrule" ADD CONSTRAINT "collectionrule_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotionproduct" ADD CONSTRAINT "promotionproduct_promotionID_fkey" FOREIGN KEY ("promotionID") REFERENCES "promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotionproduct" ADD CONSTRAINT "promotionproduct_productID_fkey" FOREIGN KEY ("productID") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotioncategory" ADD CONSTRAINT "promotioncategory_promotionID_fkey" FOREIGN KEY ("promotionID") REFERENCES "promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotioncategory" ADD CONSTRAINT "promotioncategory_categoryID_fkey" FOREIGN KEY ("categoryID") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotioncollection" ADD CONSTRAINT "promotioncollection_promotionID_fkey" FOREIGN KEY ("promotionID") REFERENCES "promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotioncollection" ADD CONSTRAINT "promotioncollection_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
