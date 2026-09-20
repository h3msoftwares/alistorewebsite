-- Admin-set "Restocked" tag on Product (a storefront badge, like the sale
-- tag) — see schema.prisma's comment on Product.isRestocked for how it's
-- set: manually from the product edit page, or automatically via the new
-- SiteSetting.autoTagRestock when a variant's stock crosses 0 -> positive.
ALTER TABLE "product" ADD COLUMN     "isRestocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sitesetting" ADD COLUMN     "autoTagRestock" BOOLEAN NOT NULL DEFAULT false;
