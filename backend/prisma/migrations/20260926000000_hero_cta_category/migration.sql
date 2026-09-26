-- Migrates the home hero's "Button links to" CTA target from Collection to
-- Category — every other storefront-chrome field on this model already
-- points at Category since the Stage 1 catalog redesign (see schema.prisma's
-- comment on heroCtaCategoryID). Pre-existing values are dropped rather than
-- carried over: a Collection id would never be a valid Category id anyway,
-- so there is nothing sound to migrate — an admin who had this explicitly
-- set just needs to re-pick it once from the (now Category-listing) admin
-- settings dropdown.

ALTER TABLE "sitesetting" DROP CONSTRAINT "sitesetting_heroCtaCollectionID_fkey";
ALTER TABLE "sitesetting" DROP COLUMN "heroCtaCollectionID";

ALTER TABLE "sitesetting" ADD COLUMN "heroCtaCategoryID" UUID;
ALTER TABLE "sitesetting" ADD CONSTRAINT "sitesetting_heroCtaCategoryID_fkey"
    FOREIGN KEY ("heroCtaCategoryID") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
