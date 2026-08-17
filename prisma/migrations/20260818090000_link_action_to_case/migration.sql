-- Link a task/Action to a RemediationCase so assigned reviews reach My Work.
-- Additive and nullable: existing ActionEntity rows are unaffected.
ALTER TABLE "ActionEntity" ADD COLUMN "remediationCaseId" TEXT;
ALTER TABLE "ActionEntity" ADD CONSTRAINT "ActionEntity_remediationCaseId_fkey"
  FOREIGN KEY ("remediationCaseId") REFERENCES "RemediationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "ActionEntity_remediationCaseId_idx" ON "ActionEntity" ("remediationCaseId");
