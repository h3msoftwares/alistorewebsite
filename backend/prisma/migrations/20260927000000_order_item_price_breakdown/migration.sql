-- Preserve historical prices: exact combo-unit allocations cannot be
-- reconstructed from legacy averages. New checkout snapshots populate this.
ALTER TABLE "orderitem" ADD COLUMN "priceBreakdown" JSONB;
