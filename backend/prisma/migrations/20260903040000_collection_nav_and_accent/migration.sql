-- Collection nav curation + per-collection accent colour.
--   showInNav   — the owner opts a collection into the top nav / footer. Order
--                 reuses the existing `sortOrder`. Defaults false so a new
--                 collection stays hidden until it is promoted.
--   accentColor — #rrggbb hex. The storefront drives the --collection-accent*
--                 CSS custom properties from it (soft tint + on-accent colour
--                 are derived on the client). NULL ⇒ the :root default accent.

-- AlterTable
ALTER TABLE "collection"
  ADD COLUMN "showInNav" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accentColor" TEXT;

-- Backfill the three seeded "door" collections so the storefront nav + accents
-- are unchanged out of the box (fixed UUIDs from 20260903000000_collections).
UPDATE "collection" SET "showInNav" = true, "accentColor" = '#a65a7e' WHERE "id" = '00000000-0000-4000-8000-000000000001'; -- women (rose)
UPDATE "collection" SET "showInNav" = true, "accentColor" = '#38455c' WHERE "id" = '00000000-0000-4000-8000-000000000002'; -- men (navy)
UPDATE "collection" SET "showInNav" = true, "accentColor" = '#b4611e' WHERE "id" = '00000000-0000-4000-8000-000000000003'; -- kids (orange)
