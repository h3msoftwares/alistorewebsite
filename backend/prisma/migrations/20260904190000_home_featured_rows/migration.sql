-- Owner-curated home page featured rows: a collection or a category can be
-- promoted into its own horizontal row on the home page (name + a scroll of
-- its categories, or its products, respectively). Independent of
-- Collection.showInNav. Order among featured rows (collections and
-- categories interleaved) reuses each table's existing sortOrder as a shared
-- ranking key.

ALTER TABLE "collection" ADD COLUMN "showOnHome" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "category"   ADD COLUMN "showOnHome" BOOLEAN NOT NULL DEFAULT false;
