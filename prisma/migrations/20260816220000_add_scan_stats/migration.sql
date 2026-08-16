-- Scan coverage metrics reported by the scanning engine.
-- Nullable and additive: existing rows and engines that do not report coverage
-- are unaffected. A NULL value means "not reported", never "complete".
ALTER TABLE "ScanJob" ADD COLUMN "scanStats" JSONB;
