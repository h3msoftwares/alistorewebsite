-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED', 'REFUNDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "orderitem" ADD COLUMN     "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stockmovement" ADD COLUMN     "orderItemID" UUID;

-- CreateTable
CREATE TABLE "return" (
    "id" UUID NOT NULL,
    "orderID" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedBy" UUID,
    "refundAmount" DECIMAL(12,2),
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returnitem" (
    "id" UUID NOT NULL,
    "returnID" UUID NOT NULL,
    "orderItemID" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refundAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "returnitem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "return_orderID_idx" ON "return"("orderID");

-- CreateIndex
CREATE INDEX "return_status_idx" ON "return"("status");

-- CreateIndex
CREATE INDEX "returnitem_returnID_idx" ON "returnitem"("returnID");

-- CreateIndex
CREATE INDEX "returnitem_orderItemID_idx" ON "returnitem"("orderItemID");

-- CreateIndex
CREATE INDEX "stockmovement_orderItemID_idx" ON "stockmovement"("orderItemID");

-- AddForeignKey
ALTER TABLE "stockmovement" ADD CONSTRAINT "stockmovement_orderItemID_fkey" FOREIGN KEY ("orderItemID") REFERENCES "orderitem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return" ADD CONSTRAINT "return_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return" ADD CONSTRAINT "return_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returnitem" ADD CONSTRAINT "returnitem_returnID_fkey" FOREIGN KEY ("returnID") REFERENCES "return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returnitem" ADD CONSTRAINT "returnitem_orderItemID_fkey" FOREIGN KEY ("orderItemID") REFERENCES "orderitem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Race-safety backstop for the returnedQuantity claim counter (see
-- OrderItem.returnedQuantity's schema comment) — mirrors the
-- stockQuantity_nonnegative precedent (migrations/20260908234500_stock_nonnegative_check).
ALTER TABLE "orderitem" ADD CONSTRAINT "orderitem_returnedquantity_bounds"
  CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");
