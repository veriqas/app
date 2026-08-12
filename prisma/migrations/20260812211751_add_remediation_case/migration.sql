-- CreateTable
CREATE TABLE "RemediationCase" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "repoUrl" TEXT,
    "algorithm" TEXT,
    "purpose" TEXT,
    "vulnerabilityType" TEXT,
    "rootCause" TEXT,
    "securityImpact" TEXT,
    "strategy" TEXT,
    "correlationKey" TEXT NOT NULL,
    "evidenceSources" TEXT[],
    "affectedFiles" TEXT[],
    "affectedDependencies" TEXT[],
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemediationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemediationCaseFinding" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "sensorType" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemediationCaseFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemediationCase_ref_key" ON "RemediationCase"("ref");

-- CreateIndex
CREATE INDEX "RemediationCase_tenantId_idx" ON "RemediationCase"("tenantId");

-- CreateIndex
CREATE INDEX "RemediationCase_status_idx" ON "RemediationCase"("status");

-- CreateIndex
CREATE INDEX "RemediationCase_correlationKey_idx" ON "RemediationCase"("correlationKey");

-- CreateIndex
CREATE INDEX "RemediationCaseFinding_observationId_idx" ON "RemediationCaseFinding"("observationId");

-- CreateIndex
CREATE UNIQUE INDEX "RemediationCaseFinding_caseId_observationId_key" ON "RemediationCaseFinding"("caseId", "observationId");

-- AddForeignKey
ALTER TABLE "RemediationCase" ADD CONSTRAINT "RemediationCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemediationCaseFinding" ADD CONSTRAINT "RemediationCaseFinding_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RemediationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemediationCaseFinding" ADD CONSTRAINT "RemediationCaseFinding_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "CryptoObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
