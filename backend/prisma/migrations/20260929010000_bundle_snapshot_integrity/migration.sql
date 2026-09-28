-- Keep V3 order-line prices immutable as well as their linked recipe snapshot.
-- Return claim counters remain mutable; Phase B will use append-only return facts.
CREATE FUNCTION protect_bundle_order_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."priceBreakdown"->>'version' = '3' AND (
    NEW."priceBreakdown" IS DISTINCT FROM OLD."priceBreakdown"
    OR NEW."orderID" IS DISTINCT FROM OLD."orderID"
    OR NEW."variantID" IS DISTINCT FROM OLD."variantID"
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice"
    OR NEW."lineTotal" IS DISTINCT FROM OLD."lineTotal")
  THEN RAISE EXCEPTION 'Bundle order-line purchase prices are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bundle_order_line_immutable BEFORE UPDATE ON orderitem
FOR EACH ROW EXECUTE FUNCTION protect_bundle_order_line();

CREATE FUNCTION check_bundle_snapshot_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line orderitem%ROWTYPE; purchase orderbundle%ROWTYPE; paid_order "order"%ROWTYPE;
BEGIN
  SELECT * INTO line FROM orderitem WHERE id=NEW."orderItemID";
  SELECT * INTO purchase FROM orderbundle WHERE id=NEW."orderBundleID";
  SELECT * INTO paid_order FROM "order" WHERE id=purchase."orderID";
  IF paid_order."couponCode" IS NOT NULL OR paid_order."discountAmount" <> 0
  THEN RAISE EXCEPTION 'Bundles and coupons are mutually exclusive'; END IF;
  IF (SELECT COUNT(DISTINCT "variantID") FROM orderbundlecomponent WHERE "orderBundleID"=purchase.id) < 2
    OR (SELECT COUNT(DISTINCT value::integer) FROM jsonb_array_elements_text(NEW."unitIndices")) <> NEW."bundledQuantity"
    OR jsonb_array_length(line."priceBreakdown"->'unitPricesCents') <> line.quantity
    OR jsonb_array_length(line."priceBreakdown"->'units') <> line.quantity
    OR (SELECT SUM(value::numeric) FROM jsonb_array_elements_text(line."priceBreakdown"->'unitPricesCents')) IS DISTINCT FROM line."lineTotal" * 100
    OR (line."priceBreakdown"->>'individualUnitPriceCents')::numeric IS DISTINCT FROM NEW."individualPrice" * 100
  THEN RAISE EXCEPTION 'Bundle snapshot identities and amounts must reconcile'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bundle_snapshot_identity_valid AFTER INSERT ON orderbundlecomponent
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_bundle_snapshot_identity();
