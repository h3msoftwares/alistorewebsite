-- Keep ordinary DELETE behavior while protecting bundle calculation evidence.
-- A BEFORE DELETE trigger must return OLD, not NEW (which is null).
CREATE OR REPLACE FUNCTION protect_bundle_return_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM orderbundlecomponent WHERE "orderItemID"=OLD."orderItemID") THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Bundle return calculations are append-only'; END IF;
    IF (NEW.id, NEW."returnID", NEW."orderItemID", NEW.quantity, NEW."refundAmount", NEW."refundBreakdown")
      IS DISTINCT FROM (OLD.id, OLD."returnID", OLD."orderItemID", OLD.quantity, OLD."refundAmount", OLD."refundBreakdown")
    THEN RAISE EXCEPTION 'Bundle return calculated shares are immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
