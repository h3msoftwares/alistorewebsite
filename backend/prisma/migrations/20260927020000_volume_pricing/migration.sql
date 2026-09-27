-- Preserve existing rule values and catalog rows. New rules explicitly opt
-- into UNIT_RATE_BANDS; legacy flat-price drafts are never auto-converted.
ALTER TABLE "comborule" ADD COLUMN "pricingModel" TEXT NOT NULL DEFAULT 'LEGACY_GROUP_TOTAL';

-- Forward cleanup of the already-applied, superseded return allocation work.
ALTER TABLE "returnitem" DROP COLUMN IF EXISTS "priceBreakdownIndices";
