/*
  Warnings:

  - You are about to drop the column `htmlBody` on the `emailtemplate` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `emailtemplate` table. All the data in the column will be lost.
  - Added the required column `htmlBodyAr` to the `emailtemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `htmlBodyEn` to the `emailtemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectAr` to the `emailtemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectEn` to the `emailtemplate` table without a default value. This is not possible if the table is not empty.

*/
-- NOTE: the diff this migration started from also proposed dropping
-- "product_searchText_trgm_idx" and an "ALTER COLUMN searchText DROP
-- DEFAULT" — both are artifacts of the diff tool not modeling a raw-SQL
-- GENERATED ALWAYS ... STORED column (see migration
-- 20260909180000_product_search_text), not expressible in schema.prisma.
-- Deliberately omitted, same as migrations
-- 20260912000000_category_tree_and_collection_product,
-- 20260913122121_add_loyalty_program, and 20260914131436_add_email_template.

-- AlterTable
ALTER TABLE "emailtemplate" DROP COLUMN "htmlBody",
DROP COLUMN "subject",
ADD COLUMN     "htmlBodyAr" TEXT NOT NULL,
ADD COLUMN     "htmlBodyEn" TEXT NOT NULL,
ADD COLUMN     "subjectAr" TEXT NOT NULL,
ADD COLUMN     "subjectEn" TEXT NOT NULL;
