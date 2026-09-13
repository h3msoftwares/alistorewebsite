-- Drops a leftover column from abandoned local "collection nesting"
-- experimentation that was never committed to schema.prisma — it only ever
-- existed on one machine's dev database via an untracked `prisma migrate
-- dev` run, never through a committed migration. (Prisma's diff tool also
-- flags product.searchText/its trigram index here, but that's a false
-- positive from a GENERATED ALWAYS AS ... STORED column Prisma doesn't
-- model natively — intentionally left untouched.)
--
-- IF EXISTS throughout: on a fresh database (`prisma migrate reset`, a new
-- clone, CI) none of this was ever created by any earlier migration, so
-- this must be a no-op there — it only does real work on the one machine
-- that had the stray column.

-- DropForeignKey
ALTER TABLE "collection" DROP CONSTRAINT IF EXISTS "collection_parentCollectionID_fkey";

-- DropIndex
DROP INDEX IF EXISTS "collection_parentCollectionID_idx";

-- AlterTable
ALTER TABLE "collection" DROP COLUMN IF EXISTS "parentCollectionID";
