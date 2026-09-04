-- Per-variant price override (null falls back to product.price — different
-- sizes/colours can share one price or each carry their own) and per-image
-- colour tag (null = shown for every colour; matches ProductVariant.color —
-- the product page swaps to the matching image(s) when that colour is picked).

ALTER TABLE "productvariant" ADD COLUMN "price" DECIMAL(12,2);
ALTER TABLE "productimage" ADD COLUMN "color" TEXT;
