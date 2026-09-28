-- CreateEnum
CREATE TYPE "GoodwillRefundStatus" AS ENUM ('OWED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundPayoutMethod" AS ENUM ('CASH');

-- CreateTable
CREATE TABLE "goodwillrefund" (
    "id" UUID NOT NULL,
    "orderID" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "GoodwillRefundStatus" NOT NULL DEFAULT 'OWED',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledBy" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "goodwillrefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refundpayout" (
    "id" UUID NOT NULL,
    "orderID" UUID NOT NULL,
    "returnID" UUID,
    "goodwillRefundID" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "RefundPayoutMethod" NOT NULL DEFAULT 'CASH',
    "payerName" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "actorID" UUID NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refundpayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goodwillrefund_orderID_status_idx" ON "goodwillrefund"("orderID", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refundpayout_returnID_key" ON "refundpayout"("returnID");

-- CreateIndex
CREATE UNIQUE INDEX "refundpayout_goodwillRefundID_key" ON "refundpayout"("goodwillRefundID");

-- CreateIndex
CREATE INDEX "refundpayout_orderID_paidOn_idx" ON "refundpayout"("orderID", "paidOn");

-- AddForeignKey
ALTER TABLE "goodwillrefund" ADD CONSTRAINT "goodwillrefund_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refundpayout" ADD CONSTRAINT "refundpayout_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refundpayout" ADD CONSTRAINT "refundpayout_returnID_fkey" FOREIGN KEY ("returnID") REFERENCES "return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refundpayout" ADD CONSTRAINT "refundpayout_goodwillRefundID_fkey" FOREIGN KEY ("goodwillRefundID") REFERENCES "goodwillrefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE goodwillrefund ADD CONSTRAINT goodwill_positive_reason CHECK (amount > 0 AND length(btrim(reason)) > 0);
ALTER TABLE goodwillrefund ADD CONSTRAINT goodwill_cancellation_reason CHECK (
  status <> 'CANCELLED' OR ("cancelledBy" IS NOT NULL AND "cancelledAt" IS NOT NULL AND length(btrim("cancellationReason")) > 0));
ALTER TABLE refundpayout ADD CONSTRAINT payout_source CHECK (("returnID" IS NULL) <> ("goodwillRefundID" IS NULL));
ALTER TABLE refundpayout ADD CONSTRAINT payout_positive_payer CHECK (amount > 0 AND length(btrim("payerName")) > 0);

CREATE FUNCTION reject_refund_payout_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Cash payout records are append-only';
END $$;
CREATE TRIGGER refund_payout_append_only BEFORE UPDATE OR DELETE ON refundpayout
FOR EACH ROW EXECUTE FUNCTION reject_refund_payout_mutation();

-- Deferred checks allow the status and its evidence to be written in either
-- order within one transaction. Historic REFUNDED rows remain untouched.
CREATE FUNCTION validate_refund_payout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_order uuid; source_amount numeric; source_status text; source_currency text;
BEGIN
  IF NEW."returnID" IS NOT NULL THEN
    SELECT r."orderID", r.status::text,
      COALESCE(r."refundedAmount", (SELECT COALESCE(SUM(ri."refundAmount"),0) FROM returnitem ri WHERE ri."returnID"=r.id)) + r."deliveryRefundAmount"
      INTO source_order, source_status, source_amount FROM "return" r WHERE r.id = NEW."returnID";
    IF source_status <> 'REFUNDED' THEN RAISE EXCEPTION 'Payout requires a refunded return'; END IF;
  ELSE
    SELECT "orderID", status::text, amount INTO source_order, source_status, source_amount
      FROM goodwillrefund WHERE id = NEW."goodwillRefundID";
    IF source_status <> 'PAID' THEN RAISE EXCEPTION 'Payout requires paid goodwill'; END IF;
  END IF;
  SELECT currency INTO source_currency FROM "order" WHERE id = source_order;
  IF source_order IS DISTINCT FROM NEW."orderID" OR source_amount IS DISTINCT FROM NEW.amount
    OR source_currency IS DISTINCT FROM NEW.currency THEN RAISE EXCEPTION 'Payout must match its source order and amount'; END IF;
  IF NEW."paidOn" > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Beirut')::date THEN RAISE EXCEPTION 'Future payout date'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER refund_payout_matches_source AFTER INSERT ON refundpayout
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_refund_payout();

CREATE FUNCTION require_refund_payout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount_due numeric;
BEGIN
  IF TG_TABLE_NAME = 'return' THEN
    IF NEW.status = 'REFUNDED' AND OLD.status <> 'REFUNDED' THEN
      SELECT COALESCE(r."refundedAmount", (SELECT COALESCE(SUM(ri."refundAmount"),0) FROM returnitem ri WHERE ri."returnID"=r.id)) + r."deliveryRefundAmount"
        INTO amount_due FROM "return" r WHERE r.id=NEW.id;
      IF amount_due > 0 AND NOT EXISTS (SELECT 1 FROM refundpayout WHERE "returnID"=NEW.id) THEN RAISE EXCEPTION 'Positive refund requires cash payout'; END IF;
    END IF;
  ELSIF NEW.status = 'PAID' AND NOT EXISTS (SELECT 1 FROM refundpayout WHERE "goodwillRefundID"=NEW.id) THEN
    RAISE EXCEPTION 'Paid goodwill requires cash payout';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER positive_return_requires_payout AFTER UPDATE OF status ON "return"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_refund_payout();
CREATE CONSTRAINT TRIGGER paid_goodwill_requires_payout AFTER INSERT OR UPDATE OF status ON goodwillrefund
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_refund_payout();
