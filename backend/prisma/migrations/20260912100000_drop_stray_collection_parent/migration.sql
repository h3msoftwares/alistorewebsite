-- Drops a leftover column from abandoned local "collection nesting"
-- experimentation that was never committed to schema.prisma. (Prisma's
-- diff tool also flags product.searchText/its trigram index here, but
-- that's a false positive from a GENERATED ALWAYS AS ... STORED column
-- Prisma doesn't model natively — intentionally left untouched.)

-- DropForeignKey
ALTER TABLE "collection" DROP CONSTRAINT "collection_parentCollectionID_fkey";

-- DropIndex
DROP INDEX "collection_parentCollectionID_idx";

-- AlterTable
ALTER TABLE "collection" DROP COLUMN "parentCollectionID";
