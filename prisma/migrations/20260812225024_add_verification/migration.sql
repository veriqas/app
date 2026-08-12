-- CreateTable
CREATE TABLE "VerificationRun" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verdictReason" TEXT,
    "repoUrl" TEXT,
    "baseRef" TEXT,
    "patchRef" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 600000,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "buildStatus" TEXT,
    "buildResult" JSONB,
    "testStatus" TEXT,
    "testResult" JSONB,
    "summary" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationFinding" (
    "id" TEXT NOT NULL,
    "verificationRunId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "scanner" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "algorithm" TEXT,
    "ruleId" TEXT,
    "normalizedLocation" TEXT,
    "dependency" TEXT,
    "severity" TEXT,
    "observationId" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationScannerResult" (
    "id" TEXT NOT NULL,
    "verificationRunId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "scanner" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationScannerResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationRun_ref_key" ON "VerificationRun"("ref");

-- CreateIndex
CREATE INDEX "VerificationRun_caseId_idx" ON "VerificationRun"("caseId");

-- CreateIndex
CREATE INDEX "VerificationRun_tenantId_idx" ON "VerificationRun"("tenantId");

-- CreateIndex
CREATE INDEX "VerificationRun_status_idx" ON "VerificationRun"("status");

-- CreateIndex
CREATE INDEX "VerificationFinding_verificationRunId_idx" ON "VerificationFinding"("verificationRunId");

-- CreateIndex
CREATE INDEX "VerificationFinding_fingerprint_idx" ON "VerificationFinding"("fingerprint");

-- CreateIndex
CREATE INDEX "VerificationScannerResult_verificationRunId_idx" ON "VerificationScannerResult"("verificationRunId");

-- AddForeignKey
ALTER TABLE "VerificationRun" ADD CONSTRAINT "VerificationRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RemediationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRun" ADD CONSTRAINT "VerificationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationFinding" ADD CONSTRAINT "VerificationFinding_verificationRunId_fkey" FOREIGN KEY ("verificationRunId") REFERENCES "VerificationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationScannerResult" ADD CONSTRAINT "VerificationScannerResult_verificationRunId_fkey" FOREIGN KEY ("verificationRunId") REFERENCES "VerificationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
