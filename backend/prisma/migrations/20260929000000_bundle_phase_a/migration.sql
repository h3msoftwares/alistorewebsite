-- CreateTable
CREATE TABLE "bundle" (
    "id" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundlecomponent" (
    "bundleID" UUID NOT NULL,
    "variantID" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "bundlecomponent_pkey" PRIMARY KEY ("bundleID","variantID")
);

-- CreateTable
CREATE TABLE "orderbundle" (
    "id" UUID NOT NULL,
    "orderID" UUID NOT NULL,
    "bundleID" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "flatPrice" DECIMAL(12,2) NOT NULL,
    "instanceCount" INTEGER NOT NULL,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orderbundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orderbundlecomponent" (
    "orderBundleID" UUID NOT NULL,
    "orderItemID" UUID NOT NULL,
    "variantID" UUID NOT NULL,
    "requiredQuantity" INTEGER NOT NULL,
    "bundledQuantity" INTEGER NOT NULL,
    "individualPrice" DECIMAL(12,2) NOT NULL,
    "unitIndices" JSONB NOT NULL,

    CONSTRAINT "orderbundlecomponent_pkey" PRIMARY KEY ("orderBundleID","orderItemID")
);

-- CreateIndex
CREATE INDEX "bundle_status_startsAt_endsAt_idx" ON "bundle"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "bundlecomponent_variantID_idx" ON "bundlecomponent"("variantID");

-- CreateIndex
CREATE UNIQUE INDEX "orderbundle_orderID_bundleID_key" ON "orderbundle"("orderID", "bundleID");

-- CreateIndex
CREATE INDEX "orderbundlecomponent_orderItemID_idx" ON "orderbundlecomponent"("orderItemID");

-- AddForeignKey
ALTER TABLE "bundlecomponent" ADD CONSTRAINT "bundlecomponent_bundleID_fkey" FOREIGN KEY ("bundleID") REFERENCES "bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundlecomponent" ADD CONSTRAINT "bundlecomponent_variantID_fkey" FOREIGN KEY ("variantID") REFERENCES "productvariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderbundle" ADD CONSTRAINT "orderbundle_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderbundle" ADD CONSTRAINT "orderbundle_bundleID_fkey" FOREIGN KEY ("bundleID") REFERENCES "bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderbundlecomponent" ADD CONSTRAINT "orderbundlecomponent_orderBundleID_fkey" FOREIGN KEY ("orderBundleID") REFERENCES "orderbundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderbundlecomponent" ADD CONSTRAINT "orderbundlecomponent_orderItemID_fkey" FOREIGN KEY ("orderItemID") REFERENCES "orderitem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE bundle ADD CONSTRAINT bundle_positive_price CHECK (price > 0);
ALTER TABLE bundle ADD CONSTRAINT bundle_valid_window CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE bundlecomponent ADD CONSTRAINT bundle_component_quantity CHECK (quantity > 0);
ALTER TABLE orderbundle ADD CONSTRAINT bundle_purchase_positive CHECK ("flatPrice" > 0 AND "instanceCount" > 0);
ALTER TABLE orderbundlecomponent ADD CONSTRAINT bundle_purchase_component_positive CHECK (
  "requiredQuantity" > 0 AND "bundledQuantity" > 0 AND "individualPrice" >= 0
  AND jsonb_typeof("unitIndices") = 'array' AND jsonb_array_length("unitIndices") = "bundledQuantity");

CREATE FUNCTION reject_bundle_purchase_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bundle purchase snapshots are append-only';
END $$;
CREATE TRIGGER bundle_purchase_append_only BEFORE UPDATE OR DELETE ON orderbundle
FOR EACH ROW EXECUTE FUNCTION reject_bundle_purchase_mutation();
CREATE TRIGGER bundle_purchase_component_append_only BEFORE UPDATE OR DELETE ON orderbundlecomponent
FOR EACH ROW EXECUTE FUNCTION reject_bundle_purchase_mutation();

-- Deferred until the group and all its components have been inserted. Ensure
-- purchase links belong to this order and unit allocations reconcile exactly.
CREATE FUNCTION validate_bundle_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE group_id uuid; purchase orderbundle%ROWTYPE; component_count integer; allocated numeric;
BEGIN
  IF TG_TABLE_NAME = 'orderbundle' THEN group_id := NEW.id;
  ELSE group_id := NEW."orderBundleID"; END IF;
  SELECT * INTO purchase FROM orderbundle WHERE id = group_id;
  SELECT COUNT(*) INTO component_count FROM orderbundlecomponent WHERE "orderBundleID" = group_id;
  IF component_count < 2 THEN RAISE EXCEPTION 'Bundle purchase requires at least two SKUs'; END IF;
  IF EXISTS (SELECT 1 FROM orderbundlecomponent c JOIN orderitem i ON i.id=c."orderItemID"
    WHERE c."orderBundleID"=group_id AND (i."orderID" <> purchase."orderID" OR i."variantID" <> c."variantID"
      OR c."bundledQuantity" <> c."requiredQuantity" * purchase."instanceCount"
      OR i."priceBreakdown"->>'version' IS DISTINCT FROM '3'
      OR i."priceBreakdown"->>'bundleID' IS DISTINCT FROM purchase."bundleID"::text
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(c."unitIndices") idx
        WHERE idx.value::integer < 0 OR idx.value::integer >= i.quantity
          OR i."priceBreakdown"->'units'->(idx.value::integer)->>'kind' IS DISTINCT FROM 'BUNDLE')))
  THEN RAISE EXCEPTION 'Bundle purchase links or quantities do not match order lines'; END IF;
  SELECT SUM((i."priceBreakdown"->'unitPricesCents'->>(idx.value::integer))::numeric)
    INTO allocated FROM orderbundlecomponent c JOIN orderitem i ON i.id=c."orderItemID",
      LATERAL jsonb_array_elements_text(c."unitIndices") idx WHERE c."orderBundleID"=group_id;
  IF allocated IS DISTINCT FROM purchase."flatPrice" * purchase."instanceCount" * 100
  THEN RAISE EXCEPTION 'Bundle paid allocations do not reconcile'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bundle_purchase_valid AFTER INSERT ON orderbundle
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_bundle_purchase();
CREATE CONSTRAINT TRIGGER bundle_purchase_component_valid AFTER INSERT ON orderbundlecomponent
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_bundle_purchase();
