-- Stage 1 of the catalog redesign (see catalog-redesign-implementation-plan.md
-- and robust-ecommerce-catalog-architecture.md at the repo root).
--
-- Category becomes a pure self-referencing tree, fully decoupled from
-- Collection. Collection becomes a flat, manual product grouping via the new
-- CollectionProduct join table. Product gets a required primaryCategoryID
-- plus optional additional placements via the new ProductCategory join
-- table. Product.collectionID (a denormalized mirror) is dropped outright —
-- no replacement column; collection membership is looked up live.
--
-- All catalog data is fake/dev-only (see the implementation plan) — this
-- migration does not attempt to backfill parentID/primaryCategoryID for
-- existing rows. Run via `prisma migrate reset`, which drops and recreates
-- the whole database and replays every migration from scratch, then reseed
-- with `npm run seed`.

-- Retire the baseline Women/Men/Kids Collection rows inserted by migration
-- 20260903000000_collections (back when Collection was the top of the
-- Collection -> Category -> Product hierarchy). Under the Stage 1 redesign
-- Women/Men/Kids become top-level Categories instead (seeded fresh by
-- prisma/seed.ts) and Collection is reserved for flat merchandising groups
-- (Sale, New Arrivals) — these three specific rows are conceptually
-- obsolete, not just re-scoped, so they're deleted outright rather than left
-- to become confusing orphaned Collection rows nothing points at anymore.
-- Cascades (CollectionImage, Discount.collection) clean up along with them.
DELETE FROM "collection" WHERE slug IN ('women', 'men', 'kids');

-- DropForeignKey
ALTER TABLE "category" DROP CONSTRAINT "category_collectionID_fkey";

-- DropForeignKey
ALTER TABLE "category" DROP CONSTRAINT "category_parentCategoryID_fkey";

-- DropForeignKey
ALTER TABLE "product" DROP CONSTRAINT "product_categoryID_fkey";

-- DropForeignKey
ALTER TABLE "product" DROP CONSTRAINT "product_collectionID_fkey";

-- DropIndex
DROP INDEX "category_collectionID_idx";

-- DropIndex
DROP INDEX "category_parentCategoryID_idx";

-- DropIndex
DROP INDEX "product_categoryID_idx";

-- DropIndex
DROP INDEX "product_collectionID_idx";

-- NOTE: the diff this migration started from also proposed dropping
-- "product_searchText_trgm_idx" and an `ALTER COLUMN "searchText" DROP
-- DEFAULT` — both are artifacts of the diff tool not modeling a raw-SQL
-- GENERATED ALWAYS ... STORED column (see migration
-- 20260909180000_product_search_text) or its GIN index, neither of which is
-- expressible in schema.prisma. Deliberately omitted: this migration is
-- scoped to the category/collection restructuring and must not touch
-- unrelated search infrastructure.

-- AlterTable
-- The showInNav/showOnHomeAsImage/accentColor/homeImageCtaEn/homeImageCtaAr
-- columns move here from Collection: with Women/Men/Kids becoming top-level
-- Categories (Collection no longer sits above Category — see the
-- implementation plan's Stage 1 nav/banner decision), the storefront top nav
-- and full-bleed home banners key off Category now.
ALTER TABLE "category" DROP COLUMN "collectionID",
DROP COLUMN "parentCategoryID",
ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentID" UUID,
ADD COLUMN     "path" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "showInNav" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showOnHomeAsImage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "homeImageCtaEn" TEXT,
ADD COLUMN     "homeImageCtaAr" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "descriptionAr" TEXT;

-- AlterTable
ALTER TABLE "product" DROP COLUMN "categoryID",
DROP COLUMN "collectionID",
ADD COLUMN     "primaryCategoryID" UUID NOT NULL;

-- CreateTable
CREATE TABLE "collectionproduct" (
    "collectionID" UUID NOT NULL,
    "productID" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collectionproduct_pkey" PRIMARY KEY ("collectionID","productID")
);

-- CreateTable
CREATE TABLE "productcategory" (
    "productID" UUID NOT NULL,
    "categoryID" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productcategory_pkey" PRIMARY KEY ("productID","categoryID")
);

-- CreateIndex
CREATE INDEX "collectionproduct_productID_idx" ON "collectionproduct"("productID");

-- CreateIndex
CREATE INDEX "productcategory_categoryID_idx" ON "productcategory"("categoryID");

-- CreateIndex
CREATE INDEX "category_parentID_sortOrder_idx" ON "category"("parentID", "sortOrder");

-- CreateIndex
CREATE INDEX "category_path_idx" ON "category"("path");

-- CreateIndex
CREATE INDEX "product_primaryCategoryID_idx" ON "product"("primaryCategoryID");

-- AddForeignKey
ALTER TABLE "collectionproduct" ADD CONSTRAINT "collectionproduct_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collectionproduct" ADD CONSTRAINT "collectionproduct_productID_fkey" FOREIGN KEY ("productID") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parentID_fkey" FOREIGN KEY ("parentID") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_primaryCategoryID_fkey" FOREIGN KEY ("primaryCategoryID") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productcategory" ADD CONSTRAINT "productcategory_productID_fkey" FOREIGN KEY ("productID") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productcategory" ADD CONSTRAINT "productcategory_categoryID_fkey" FOREIGN KEY ("categoryID") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============ Category tree integrity + path/depth triggers ============
-- Cheap, always-true backstop: a category can never be its own parent.
-- (The harder case — re-parenting under one's own descendant — needs a
-- lookup, so it's checked inside category_compute_path() below instead of a
-- CHECK constraint.)
ALTER TABLE "category" ADD CONSTRAINT "category_not_own_parent" CHECK ("parentID" IS DISTINCT FROM "id");

-- Computes THIS row's own path/depth from its parent's CURRENT path/depth.
-- This is the only code that ever writes category.path/category.depth for
-- the row being inserted/updated — never application code (see the
-- Category model's doc comment in schema.prisma for why: a second,
-- app-code-maintained source of truth for a derived value is exactly the
-- `Product.quantity` failure shape one layer up).
CREATE OR REPLACE FUNCTION category_compute_path() RETURNS trigger AS $$
DECLARE
  parent_path  text;
  parent_depth int;
BEGIN
  IF NEW."parentID" IS NULL THEN
    NEW.path := '/' || NEW.slug || '/';
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT path, depth INTO parent_path, parent_depth FROM "category" WHERE id = NEW."parentID";
  IF parent_path IS NULL THEN
    RAISE EXCEPTION 'parent category % does not exist', NEW."parentID";
  END IF;

  -- Cycle guard: refuse re-parenting a category under one of its own
  -- descendants — that would show up as the chosen parent's path already
  -- starting with this row's OWN (pre-update) path.
  IF TG_OP = 'UPDATE' AND parent_path LIKE (OLD.path || '%') THEN
    RAISE EXCEPTION 'cannot move category % under its own descendant %', NEW.id, NEW."parentID";
  END IF;

  NEW.path := parent_path || NEW.slug || '/';
  NEW.depth := parent_depth + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER category_compute_path_trigger
BEFORE INSERT OR UPDATE OF "parentID", slug ON "category"
FOR EACH ROW
EXECUTE FUNCTION category_compute_path();

-- Cascades a moved/renamed category's new path/depth onto every descendant,
-- in one statement — a string-prefix replace naturally reaches every depth
-- of the subtree at once, no recursion required for the data change itself.
--
-- Deliberately NOT declared as "AFTER UPDATE OF path": Postgres's "UPDATE OF
-- column_list" trigger filter matches columns named in the CLIENT's SET
-- clause, not columns a BEFORE trigger went on to change — category_compute_
-- path_trigger sets NEW.path as a side effect of an UPDATE whose own SET
-- clause only mentions "slug" (or "parentID"), so an "OF path"-filtered AFTER
-- trigger silently never fires (confirmed by hand: renaming a mid-tree
-- category left its descendants' path/depth stale). This trigger fires on
-- every UPDATE instead, and does the OLD.path/NEW.path comparison itself.
--
-- The pg_trigger_depth() guard stops this trigger from re-cascading once per
-- descendant row IT JUST UPDATED (that row's own AFTER UPDATE trigger fires
-- too, since the cascade UPDATE below changes ITS path) — without the guard
-- this both re-does work the one UPDATE below already did and, for a
-- deep/wide subtree, degrades to O(n^2).
CREATE OR REPLACE FUNCTION category_cascade_path() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF OLD.path IS DISTINCT FROM NEW.path THEN
    UPDATE "category"
    SET path  = NEW.path || substring(path from char_length(OLD.path) + 1),
        depth = depth + (NEW.depth - OLD.depth)
    WHERE path LIKE (OLD.path || '%') AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER category_cascade_path_trigger
AFTER UPDATE ON "category"
FOR EACH ROW
EXECUTE FUNCTION category_cascade_path();
