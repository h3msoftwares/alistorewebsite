-- Admin-controlled delivery fee.
--   sitesetting  — master switch, flat fee, free-over threshold, free governorates
--   deliveryrate — per-governorate fee override (replace-all, like announcementline)
--   order        — deliveryFee + deliveryRegion snapshot; total = subtotal + deliveryFee
--   address      — region so a saved address can prefill the checkout governorate

ALTER TABLE "sitesetting"
    ADD COLUMN "deliveryFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "deliveryFeeFlat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "freeDeliveryThreshold" DECIMAL(12,2),
    ADD COLUMN "freeDeliveryRegions" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "order"
    ADD COLUMN "deliveryRegion" TEXT,
    ADD COLUMN "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "address"
    ADD COLUMN "region" TEXT;

CREATE TABLE "deliveryrate" (
    "id" UUID NOT NULL,
    "settingID" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deliveryrate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deliveryrate_settingID_region_key" ON "deliveryrate"("settingID", "region");
CREATE INDEX "deliveryrate_settingID_idx" ON "deliveryrate"("settingID");

ALTER TABLE "deliveryrate" ADD CONSTRAINT "deliveryrate_settingID_fkey"
    FOREIGN KEY ("settingID") REFERENCES "sitesetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
