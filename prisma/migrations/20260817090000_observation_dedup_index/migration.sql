-- Index supporting the ingest dedup lookup, which runs once per observation.
-- Additive: creates an index only, no data or schema semantics change.
CREATE INDEX IF NOT EXISTS "CryptoObservation_dedup_idx"
  ON "CryptoObservation" ("tenantId", "sensorType", "algorithm", "filePath", "lineNumber");
