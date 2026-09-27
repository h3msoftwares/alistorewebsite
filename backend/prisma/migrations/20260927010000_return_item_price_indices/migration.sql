-- Record which immutable checkout unit prices a return claims. Do not infer
-- allocations for historical returns from their rounded average amounts.
ALTER TABLE "returnitem" ADD COLUMN "priceBreakdownIndices" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
