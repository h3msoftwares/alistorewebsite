-- Preserve existing append-only evidence; only relax the reference requirement.
ALTER TABLE "codcollection" ALTER COLUMN "reference" DROP NOT NULL;
ALTER TABLE "codcollection" DROP CONSTRAINT "codcollection_reference_required";
ALTER TABLE "codcollection" ADD CONSTRAINT "codcollection_collector_required"
  CHECK (length(trim("collectorName")) > 0);
ALTER TABLE "codcollection" ADD CONSTRAINT "codcollection_reference_nonblank"
  CHECK ("reference" IS NULL OR length(trim("reference")) > 0);
