-- Brand rename: "Ali's Store" (EN) / "متجر علي" (AR) -> the single literal
-- "Ali'sStore" in both languages (not translated). Updates the column
-- defaults (for a fresh install's seed row) and the already-seeded singleton
-- row alike, but only when it still holds the old out-of-the-box value —
-- leaves it alone if an owner already customised it via the admin settings
-- page.

ALTER TABLE "sitesetting" ALTER COLUMN "brandNameEn" SET DEFAULT 'Ali''sStore';
ALTER TABLE "sitesetting" ALTER COLUMN "brandNameAr" SET DEFAULT 'Ali''sStore';

UPDATE "sitesetting" SET "brandNameEn" = 'Ali''sStore' WHERE "brandNameEn" = 'Ali''s Store';
UPDATE "sitesetting" SET "brandNameAr" = 'Ali''sStore' WHERE "brandNameAr" = 'متجر علي';
