-- Note: prisma migrate dev's diff engine misreads product.searchText as
-- needing `DROP DEFAULT` (and its trigram index as stale) because
-- searchText is a Postgres GENERATED column that Prisma's schema only
-- models as a plain nullable String (see the field's doc comment in
-- schema.prisma) — that diff noise is unrelated to this migration's actual
-- change and was removed by hand; do not reintroduce it.

-- CreateTable
CREATE TABLE "comborule" (
    "id" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comborule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combotier" (
    "id" UUID NOT NULL,
    "comboRuleID" UUID NOT NULL,
    "minQty" INTEGER NOT NULL,
    "maxQty" INTEGER,
    "price" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "combotier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comboruleproduct" (
    "comboRuleID" UUID NOT NULL,
    "productID" UUID NOT NULL,

    CONSTRAINT "comboruleproduct_pkey" PRIMARY KEY ("comboRuleID","productID")
);

-- CreateTable
CREATE TABLE "comborulecategory" (
    "comboRuleID" UUID NOT NULL,
    "categoryID" UUID NOT NULL,
    "includeDescendants" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "comborulecategory_pkey" PRIMARY KEY ("comboRuleID","categoryID")
);

-- CreateTable
CREATE TABLE "comborulecollection" (
    "comboRuleID" UUID NOT NULL,
    "collectionID" UUID NOT NULL,

    CONSTRAINT "comborulecollection_pkey" PRIMARY KEY ("comboRuleID","collectionID")
);

-- CreateIndex
CREATE INDEX "comborule_status_idx" ON "comborule"("status");

-- CreateIndex
CREATE INDEX "comborule_startsAt_endsAt_idx" ON "comborule"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "combotier_comboRuleID_idx" ON "combotier"("comboRuleID");

-- CreateIndex
CREATE INDEX "comboruleproduct_productID_idx" ON "comboruleproduct"("productID");

-- CreateIndex
CREATE INDEX "comborulecategory_categoryID_idx" ON "comborulecategory"("categoryID");

-- CreateIndex
CREATE INDEX "comborulecollection_collectionID_idx" ON "comborulecollection"("collectionID");

-- AddForeignKey
ALTER TABLE "combotier" ADD CONSTRAINT "combotier_comboRuleID_fkey" FOREIGN KEY ("comboRuleID") REFERENCES "comborule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comboruleproduct" ADD CONSTRAINT "comboruleproduct_comboRuleID_fkey" FOREIGN KEY ("comboRuleID") REFERENCES "comborule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comboruleproduct" ADD CONSTRAINT "comboruleproduct_productID_fkey" FOREIGN KEY ("productID") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comborulecategory" ADD CONSTRAINT "comborulecategory_comboRuleID_fkey" FOREIGN KEY ("comboRuleID") REFERENCES "comborule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comborulecategory" ADD CONSTRAINT "comborulecategory_categoryID_fkey" FOREIGN KEY ("categoryID") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comborulecollection" ADD CONSTRAINT "comborulecollection_comboRuleID_fkey" FOREIGN KEY ("comboRuleID") REFERENCES "comborule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comborulecollection" ADD CONSTRAINT "comborulecollection_collectionID_fkey" FOREIGN KEY ("collectionID") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
