CREATE TABLE "codcollection" (
  "id" UUID NOT NULL,
  "orderID" UUID NOT NULL,
  "actorID" UUID NOT NULL,
  "actorName" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "collectorName" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "note" TEXT,
  "reason" TEXT,
  "reversalOfID" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "codcollection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "codcollection_amount_kind" CHECK (
    ("reversalOfID" IS NULL AND "amount" > 0 AND "reason" IS NULL) OR
    ("reversalOfID" IS NOT NULL AND "amount" < 0 AND length(trim("reason")) > 0 AND "reason" IS NOT NULL)
  ),
  CONSTRAINT "codcollection_reference_required" CHECK (length(trim("reference")) > 0 AND length(trim("collectorName")) > 0),
  CONSTRAINT "codcollection_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "codcollection_actorID_fkey" FOREIGN KEY ("actorID") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "codcollection_reversalOfID_fkey" FOREIGN KEY ("reversalOfID") REFERENCES "codcollection"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "codcollection_reversalOfID_key" ON "codcollection"("reversalOfID");
CREATE INDEX "codcollection_orderID_createdAt_idx" ON "codcollection"("orderID", "createdAt");

CREATE FUNCTION reject_collection_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COD collection evidence is append-only: record a reversal instead';
END;
$$;
CREATE TRIGGER codcollection_append_only BEFORE UPDATE OR DELETE ON "codcollection"
FOR EACH ROW EXECUTE FUNCTION reject_collection_mutation();
