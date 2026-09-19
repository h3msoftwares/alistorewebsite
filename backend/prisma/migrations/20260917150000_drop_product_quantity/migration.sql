-- AlterTable
-- Product.quantity was a dead, free-standing signed integer column — never
-- derived from or validated against variant stock, and not read by any
-- route or the admin UI (stock is always summed from ProductVariant rows).
ALTER TABLE "product" DROP COLUMN "quantity";
