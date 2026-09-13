-- CreateEnum
CREATE TYPE "LoyaltyMetric" AS ENUM ('ORDER_COUNT', 'TOTAL_SPENT');

-- NOTE: the diff this migration started from also proposed dropping
-- "product_searchText_trgm_idx" and an "ALTER COLUMN searchText DROP
-- DEFAULT" — both are artifacts of the diff tool not modeling a raw-SQL
-- GENERATED ALWAYS ... STORED column (see migration
-- 20260909180000_product_search_text), not expressible in schema.prisma.
-- Deliberately omitted, same as migration
-- 20260912000000_category_tree_and_collection_product.

-- CreateTable
CREATE TABLE "loyaltyrule" (
    "id" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "metric" "LoyaltyMetric" NOT NULL,
    "threshold" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rewardType" "DiscountType" NOT NULL,
    "rewardValue" DECIMAL(12,2) NOT NULL,
    "couponValidDays" INTEGER,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyaltyrule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyaltyaward" (
    "id" UUID NOT NULL,
    "ruleID" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "milestoneNumber" INTEGER NOT NULL,
    "couponID" UUID,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyaltyaward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyaltyaward_userID_idx" ON "loyaltyaward"("userID");

-- CreateIndex
CREATE UNIQUE INDEX "loyaltyaward_ruleID_userID_milestoneNumber_key" ON "loyaltyaward"("ruleID", "userID", "milestoneNumber");

-- AddForeignKey
ALTER TABLE "loyaltyaward" ADD CONSTRAINT "loyaltyaward_ruleID_fkey" FOREIGN KEY ("ruleID") REFERENCES "loyaltyrule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyaltyaward" ADD CONSTRAINT "loyaltyaward_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyaltyaward" ADD CONSTRAINT "loyaltyaward_couponID_fkey" FOREIGN KEY ("couponID") REFERENCES "coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
