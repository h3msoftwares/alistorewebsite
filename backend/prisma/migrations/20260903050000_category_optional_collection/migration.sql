-- A category may now stand alone, unattached to any collection.
--   category.collectionID  — becomes NULLable. The FK switches from
--     ON DELETE CASCADE to ON DELETE SET NULL, so deleting a collection now
--     detaches its categories (they survive as standalone) instead of removing
--     them.
--   product.collectionID   — the denormalized mirror of Category.collectionID.
--     Also becomes NULLable (a product under a standalone category has no
--     collection), and its FK switches from ON DELETE RESTRICT to
--     ON DELETE SET NULL to match. The value is derived from the product's
--     category in application code, never set directly.

-- category.collectionID -> nullable + ON DELETE SET NULL
ALTER TABLE "category" ALTER COLUMN "collectionID" DROP NOT NULL;
ALTER TABLE "category" DROP CONSTRAINT "category_collectionID_fkey";
ALTER TABLE "category" ADD CONSTRAINT "category_collectionID_fkey"
  FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- product.collectionID -> nullable + ON DELETE SET NULL
ALTER TABLE "product" ALTER COLUMN "collectionID" DROP NOT NULL;
ALTER TABLE "product" DROP CONSTRAINT "product_collectionID_fkey";
ALTER TABLE "product" ADD CONSTRAINT "product_collectionID_fkey"
  FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
