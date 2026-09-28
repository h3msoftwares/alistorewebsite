-- Forward-only: no effective-amount backfill and no catalog/inventory changes.
ALTER TABLE "return"
  ADD COLUMN "refundedAmount" DECIMAL(12,2),
  ADD COLUMN "refundAdjustmentReason" TEXT,
  ADD COLUMN "refundAdjustedBy" UUID,
  ADD COLUMN "refundAdjustedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryRefundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryRefundReason" TEXT;
ALTER TABLE "returnitem" ADD COLUMN "refundedAmount" DECIMAL(12,2);
ALTER TABLE "return" ADD CONSTRAINT "return_effective_refunds_nonnegative"
  CHECK (("refundedAmount" IS NULL OR "refundedAmount" >= 0) AND "deliveryRefundAmount" >= 0);
ALTER TABLE "returnitem" ADD CONSTRAINT "returnitem_effective_refund_nonnegative"
  CHECK ("refundedAmount" IS NULL OR "refundedAmount" >= 0);
