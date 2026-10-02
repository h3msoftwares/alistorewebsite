-- Owner-built home-page grids: 2+ categories shown side by side, ordered
-- among the other home blocks by sortOrder.

CREATE TABLE "homegrid" (
    "id" UUID NOT NULL,
    "settingID" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "titleEn" TEXT,
    "titleAr" TEXT,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homegrid_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "homegriditem" (
    "gridID" UUID NOT NULL,
    "categoryID" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "homegriditem_pkey" PRIMARY KEY ("gridID","categoryID")
);

CREATE INDEX "homegrid_settingID_idx" ON "homegrid"("settingID");
CREATE INDEX "homegriditem_categoryID_idx" ON "homegriditem"("categoryID");

ALTER TABLE "homegrid" ADD CONSTRAINT "homegrid_settingID_fkey" FOREIGN KEY ("settingID") REFERENCES "sitesetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homegriditem" ADD CONSTRAINT "homegriditem_gridID_fkey" FOREIGN KEY ("gridID") REFERENCES "homegrid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homegriditem" ADD CONSTRAINT "homegriditem_categoryID_fkey" FOREIGN KEY ("categoryID") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
