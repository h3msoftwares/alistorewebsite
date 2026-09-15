-- AlterTable
ALTER TABLE "coupon" ALTER COLUMN "maxRedemptions" SET DEFAULT 1;

-- Existing coupons created before this default had maxRedemptions = NULL
-- (unlimited global reuse). Bring them in line with the new default: fully
-- single-use (one customer, one time). Admins can raise or clear the cap per
-- coupon afterwards.
UPDATE "coupon" SET "maxRedemptions" = 1 WHERE "maxRedemptions" IS NULL;
