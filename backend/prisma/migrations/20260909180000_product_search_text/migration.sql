-- Lenient catalogue search.
--
-- `searchText` is a generated, read-only haystack per product:
--   "<lower nameEn> <lower nameAr>  <the same, punctuation & whitespace removed>"
-- The punctuation-stripped tail is what lets "tshirt" match "T-Shirt" and
-- "3pack" match "3-Pack" — the app also de-pluralizes tokens and expands a few
-- apparel synonyms before probing this column with ILIKE '%…%'.
--
-- pg_trgm + a GIN index keep those substring / partial-word probes off a
-- sequential scan as the catalogue grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "product" ADD COLUMN "searchText" TEXT
  GENERATED ALWAYS AS (
    lower(coalesce("nameEn", '') || ' ' || coalesce("nameAr", ''))
    || ' ' ||
    regexp_replace(
      lower(coalesce("nameEn", '') || ' ' || coalesce("nameAr", '')),
      '[[:space:][:punct:]]+', '', 'g'
    )
  ) STORED;

CREATE INDEX "product_searchText_trgm_idx"
  ON "product" USING gin ("searchText" gin_trgm_ops);
