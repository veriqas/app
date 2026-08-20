-- Department a scan was run for, so its findings are attributable.
-- Additive and nullable: existing scan jobs are unaffected.
ALTER TABLE "ScanJob" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "ScanJob" ADD CONSTRAINT "ScanJob_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "ScanJob_businessUnitId_idx" ON "ScanJob" ("businessUnitId");
