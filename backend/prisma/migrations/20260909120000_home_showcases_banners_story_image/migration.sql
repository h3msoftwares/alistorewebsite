-- "Our story" page: an optional image beside the text.
ALTER TABLE "sitesetting" ADD COLUMN     "storyImageFileId" TEXT,
ADD COLUMN     "storyImageUrl" TEXT;

-- Home-page image banner (showOnHomeAsImage): a CTA label. The banner's
-- background colour reuses `accentColor` and its copy reuses `descriptionEn` /
-- `descriptionAr`, so only the button text is new.
ALTER TABLE "collection" ADD COLUMN     "homeImageCtaAr" TEXT,
ADD COLUMN     "homeImageCtaEn" TEXT;

-- Built-in "smart" home-page rows.
CREATE TYPE "ShowcaseType" AS ENUM ('BEST_SELLERS', 'NEW_ARRIVALS', 'ON_SALE');

CREATE TABLE "homeshowcase" (
    "type" "ShowcaseType" NOT NULL,
    "settingID" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "labelEn" TEXT,
    "labelAr" TEXT,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homeshowcase_pkey" PRIMARY KEY ("type")
);

CREATE INDEX "homeshowcase_settingID_idx" ON "homeshowcase"("settingID");

ALTER TABLE "homeshowcase" ADD CONSTRAINT "homeshowcase_settingID_fkey" FOREIGN KEY ("settingID") REFERENCES "sitesetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the three rows (all inactive; the owner turns them on and orders them).
-- The sitesetting singleton (id 1) is created by 20260905110000_site_settings.
INSERT INTO "homeshowcase" ("type", "settingID", "sortOrder") VALUES
  ('BEST_SELLERS', 1, 100),
  ('NEW_ARRIVALS', 1, 101),
  ('ON_SALE', 1, 102)
ON CONFLICT ("type") DO NOTHING;
