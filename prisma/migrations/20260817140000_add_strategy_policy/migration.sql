-- Deterministic strategy policy applied to a remediation attempt.
-- Additive and nullable: existing attempts are unaffected.
ALTER TABLE "RemediationAttempt" ADD COLUMN "strategyPolicyVersion" TEXT;
ALTER TABLE "RemediationAttempt" ADD COLUMN "policyJson" JSONB;
