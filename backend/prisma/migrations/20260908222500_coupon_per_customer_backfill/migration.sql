-- Existing coupons created before per-customer defaulting had
-- maxPerCustomer = NULL (unlimited reuse by the same shopper). Bring them in
-- line with the new default: single-use per customer. Admins can raise or
-- clear the cap per coupon afterwards.
UPDATE "coupon" SET "maxPerCustomer" = 1 WHERE "maxPerCustomer" IS NULL;
