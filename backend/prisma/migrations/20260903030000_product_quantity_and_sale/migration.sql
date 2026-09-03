-- Product-level `quantity` (free-standing signed integer — may be 0 or
-- negative, no bearing on `isActive`) and an optional sale (`saleType`
-- PERCENT/AMOUNT + `saleValue`).

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "saleType" "DiscountType",
ADD COLUMN     "saleValue" DECIMAL(12,2);
