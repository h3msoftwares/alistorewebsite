-- Owner-curated home page: a collection can be shown as a single square image
-- (its base image) in a grid at the top of the home page, with no category
-- row. Position within that grid reuses the existing sortOrder. Takes
-- precedence over showOnHome.

ALTER TABLE "collection" ADD COLUMN "showOnHomeAsImage" BOOLEAN NOT NULL DEFAULT false;
