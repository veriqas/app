import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { PageShell } from "@/components/layout/page-shell";
import { ScanJobsClient } from "./client";
import { SCANNER_REGISTRY } from "@/lib/scanners/registry";
import { ENGINE_REGISTRY } from "@/lib/scanners/engine-registry";

// Jobs stuck in RUNNING for more than 10 minutes without completing are orphaned
// (most likely from a server restart). Mark them FAILED so they don't block the UI.
const STUCK_THRESHOLD_MS = 10 * 60 * 1000;

export default async function ScanJobsPage() {
  const ctx = await requireAuth();

  // Recover orphaned RUNNING jobs
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  await db.scanJob.updateMany({
    where: {
      tenantId: ctx.tenantId,
      status: "RUNNING",
      startedAt: { lt: stuckCutoff },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: "Job timed out — server may have restarted mid-scan. Please retry.",
    },
  });

  const jobs = await db.scanJob.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      sensor: { select: { name: true, sensorType: true } },
      _count: { select: { results: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const serialized = jobs.map((j) => ({
    ...j,
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  }));

  // Check availability for every scanner so the UI can show which ones are ready.
  const availabilityChecks = await Promise.all(
    SCANNER_REGISTRY.map(async (s) => {
      const engine = ENGINE_REGISTRY.get(s.sensorType);
      const available = engine ? await engine.isAvailable().catch(() => false) : false;
      return { sensorType: s.sensorType, available };
    })
  );
  const availabilityMap = Object.fromEntries(
    availabilityChecks.map((c) => [c.sensorType, c.available])
  );

  return (
    <PageShell
      title="Scan Jobs"
      breadcrumbs={[{ label: "Discovery" }, { label: "Scan Jobs" }]}
    >
      <ScanJobsClient jobs={serialized} scanners={SCANNER_REGISTRY} scannerAvailability={availabilityMap} />
    </PageShell>
  );
}
