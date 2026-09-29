-- Forward-only Phase B: immutable group calculations, alongside the existing
-- Return/ReturnItem workflow. No live catalog inputs or purchase mutations.
CREATE TABLE returnbundlecalculation (
  "returnID" UUID NOT NULL,
  "orderBundleID" UUID NOT NULL,
  "refundAmount" DECIMAL(12,2) NOT NULL,
  calculation JSONB NOT NULL,
  CONSTRAINT returnbundlecalculation_pkey PRIMARY KEY ("returnID", "orderBundleID"),
  CONSTRAINT returnbundlecalculation_return_fkey FOREIGN KEY ("returnID") REFERENCES "return"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT returnbundlecalculation_purchase_fkey FOREIGN KEY ("orderBundleID") REFERENCES orderbundle(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT bundle_return_amount CHECK ("refundAmount" >= 0
    AND calculation->>'version' IS NOT DISTINCT FROM '1'
    AND calculation->>'method' IS NOT DISTINCT FROM 'BUNDLE_KEPT_QUANTITY'
    AND (calculation->>'refundCents')::numeric IS NOT DISTINCT FROM "refundAmount" * 100)
);
CREATE INDEX "returnbundlecalculation_orderBundleID_idx" ON returnbundlecalculation("orderBundleID");
CREATE TRIGGER bundle_return_append_only BEFORE UPDATE OR DELETE ON returnbundlecalculation
FOR EACH ROW EXECUTE FUNCTION reject_bundle_purchase_mutation();

-- Deferred so the Return, group evidence and all ReturnItems can be created
-- together. A v3 line must never fall back to ordinary per-line entitlement.
CREATE FUNCTION validate_bundle_return() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE return_id uuid; purchase_id uuid; evidence returnbundlecalculation%ROWTYPE; allocated numeric;
BEGIN
  return_id := NEW."returnID";
  IF TG_TABLE_NAME = 'returnbundlecalculation' THEN purchase_id := NEW."orderBundleID";
  ELSE
    SELECT "orderBundleID" INTO purchase_id FROM orderbundlecomponent WHERE "orderItemID" = NEW."orderItemID";
    IF purchase_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM orderitem WHERE id=NEW."orderItemID" AND "priceBreakdown"->>'version'='3')
      THEN RAISE EXCEPTION 'Bundle return purchase evidence is missing'; END IF;
      RETURN NULL;
    END IF;
  END IF;
  SELECT * INTO evidence FROM returnbundlecalculation WHERE "returnID"=return_id AND "orderBundleID"=purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bundle return calculation evidence is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "return" r JOIN orderbundle b ON b."orderID"=r."orderID"
    WHERE r.id=return_id AND b.id=purchase_id)
    OR evidence.calculation->>'orderBundleID' IS DISTINCT FROM purchase_id::text
  THEN RAISE EXCEPTION 'Bundle return evidence belongs to another order'; END IF;
  SELECT SUM(ri."refundAmount") INTO allocated FROM returnitem ri JOIN orderbundlecomponent c ON c."orderItemID"=ri."orderItemID"
    WHERE ri."returnID"=return_id AND c."orderBundleID"=purchase_id;
  IF allocated IS DISTINCT FROM evidence."refundAmount" OR NOT EXISTS (
    SELECT 1 FROM returnitem ri JOIN orderbundlecomponent c ON c."orderItemID"=ri."orderItemID"
    WHERE ri."returnID"=return_id AND c."orderBundleID"=purchase_id)
  THEN RAISE EXCEPTION 'Bundle return allocations do not reconcile'; END IF;
  IF jsonb_typeof(evidence.calculation->'allocations') IS DISTINCT FROM 'array'
    OR jsonb_array_length(evidence.calculation->'allocations') <> (
      SELECT COUNT(*) FROM returnitem ri JOIN orderbundlecomponent c ON c."orderItemID"=ri."orderItemID"
      WHERE ri."returnID"=return_id AND c."orderBundleID"=purchase_id)
    OR EXISTS (SELECT 1 FROM returnitem ri JOIN orderbundlecomponent c ON c."orderItemID"=ri."orderItemID"
      WHERE ri."returnID"=return_id AND c."orderBundleID"=purchase_id AND (
        SELECT COUNT(*) FROM jsonb_array_elements(evidence.calculation->'allocations') a
        WHERE a->>'orderItemID'=ri."orderItemID"::text AND (a->>'quantity')::integer=ri.quantity
          AND (a->>'refundCents')::numeric=ri."refundAmount"*100) <> 1)
  THEN RAISE EXCEPTION 'Bundle return explanation does not match returned lines'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bundle_return_valid AFTER INSERT ON returnbundlecalculation
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_bundle_return();

-- Freeze calculated bundle shares too; only the existing effective paid field
-- may change at refund marking. Ordinary historical rows retain their policy.
CREATE FUNCTION protect_bundle_return_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM orderbundlecomponent WHERE "orderItemID"=OLD."orderItemID") THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Bundle return calculations are append-only'; END IF;
    IF (NEW.id, NEW."returnID", NEW."orderItemID", NEW.quantity, NEW."refundAmount", NEW."refundBreakdown")
      IS DISTINCT FROM (OLD.id, OLD."returnID", OLD."orderItemID", OLD.quantity, OLD."refundAmount", OLD."refundBreakdown")
    THEN RAISE EXCEPTION 'Bundle return calculated shares are immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bundle_return_item_immutable BEFORE UPDATE OR DELETE ON returnitem
FOR EACH ROW EXECUTE FUNCTION protect_bundle_return_item();
CREATE CONSTRAINT TRIGGER bundle_return_item_valid AFTER INSERT ON returnitem
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_bundle_return();
