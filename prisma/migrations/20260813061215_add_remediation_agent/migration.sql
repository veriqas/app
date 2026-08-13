-- CreateTable
CREATE TABLE "RemediationAttempt" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "strategy" TEXT,
    "investigationJson" JSONB,
    "rootCauseJson" JSONB,
    "planJson" JSONB,
    "verdict" TEXT,
    "verificationRunId" TEXT,
    "diagnosisJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemediationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemediationChange" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "originalHash" TEXT,
    "patchedHash" TEXT,
    "originalContent" TEXT,
    "patchedContent" TEXT,
    "diffPatch" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemediationChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIStageResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "structuredJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIStageResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemediationAttempt_ref_key" ON "RemediationAttempt"("ref");

-- CreateIndex
CREATE INDEX "RemediationAttempt_caseId_idx" ON "RemediationAttempt"("caseId");

-- CreateIndex
CREATE INDEX "RemediationAttempt_tenantId_idx" ON "RemediationAttempt"("tenantId");

-- CreateIndex
CREATE INDEX "RemediationAttempt_status_idx" ON "RemediationAttempt"("status");

-- CreateIndex
CREATE INDEX "RemediationChange_attemptId_idx" ON "RemediationChange"("attemptId");

-- CreateIndex
CREATE INDEX "AIStageResult_attemptId_idx" ON "AIStageResult"("attemptId");

-- AddForeignKey
ALTER TABLE "RemediationAttempt" ADD CONSTRAINT "RemediationAttempt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RemediationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemediationAttempt" ADD CONSTRAINT "RemediationAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemediationChange" ADD CONSTRAINT "RemediationChange_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "RemediationAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStageResult" ADD CONSTRAINT "AIStageResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "RemediationAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
