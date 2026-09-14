-- NOTE: the diff this migration started from also proposed dropping
-- "product_searchText_trgm_idx" and an "ALTER COLUMN searchText DROP
-- DEFAULT" — both are artifacts of the diff tool not modeling a raw-SQL
-- GENERATED ALWAYS ... STORED column (see migration
-- 20260909180000_product_search_text), not expressible in schema.prisma.
-- Deliberately omitted, same as migrations
-- 20260912000000_category_tree_and_collection_product and
-- 20260913122121_add_loyalty_program.

-- CreateTable
CREATE TABLE "emailtemplate" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailtemplate_pkey" PRIMARY KEY ("key")
);
