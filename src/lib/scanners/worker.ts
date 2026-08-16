/**
 * Scanner worker — generic execution layer.
 * Routes every scan job through the ENGINE_REGISTRY; no scanner-specific
 * branching lives here. Adding a new scanner requires only:
 *   1. Register an EngineDefinition in engine-registry.ts
 *   2. Register a SensorAdapter in src/lib/sensors/index.ts
 *   3. No changes to this file.
 */

import { db } from "@/lib/db/client";
import { processScanOutput, writeObservations } from "@/lib/sensors";
import type { ScanContext } from "@/lib/sensors";
import { getScannerByType } from "./registry";
import { generateRisksFromScanJob } from "@/lib/risks/risk-engine";
import { calculateAndStoreReadinessScore } from "@/lib/services/scoring.service";
import { ENGINE_REGISTRY } from "./engine-registry";
import { cloneRepo } from "./engines/git-clone";

export interface WorkerResult {
  observationsWritten: number;
  observationsSkipped: number;
  errors: number;
  durationMs: number;
}

export async function executeScanJob(jobId: string): Promise<WorkerResult> {
  const start = Date.now();

  const job = await db.scanJob.findUnique({
    where: { id: jobId },
    include: { sensor: true, scope: true },
  });

  if (!job) throw new Error(`ScanJob ${jobId} not found`);
  if (job.status === "COMPLETED" || job.status === "FAILED") throw new Error(`Job ${jobId} already ${job.status.toLowerCase()}`);

  await db.scanJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const ctx: ScanContext = {
      tenantId: job.tenantId,
      scanJobId: job.id,
      sensorType: job.sensor.sensorType,
      evidenceSource: getScannerByType(job.sensor.sensorType)?.evidenceSource ?? "STATIC_DETECTION",
      scannedAt: new Date(),
    };

    const rawOutput = await runEngine(job.sensor.sensorType, job.targets);

    const rawItems = Array.isArray(rawOutput) ? rawOutput : [rawOutput];
    const observations = rawItems.flatMap(item =>
      processScanOutput(job.sensor.sensorType, item, ctx)
    );

    const { written, skipped, errors } = await writeObservations(observations, ctx);

    const risks = await generateRisksFromScanJob(jobId, job.tenantId).catch(e => {
      console.error("[risk-engine] failed:", e);
      return { created: 0, updated: 0, skipped: 0 };
    });

    const newScore = await calculateAndStoreReadinessScore(job.tenantId).catch(e => {
      console.error("[scoring] failed:", e);
      return null;
    });

    const durationMs = Date.now() - start;
    console.log(`[worker] scan ${job.ref} complete - obs: ${written} written, ${skipped} skipped | risks: ${risks.created} created | score: ${newScore ?? "err"}`);

    // Coverage metrics, when the engine reports them. Generic: any engine whose
    // output carries `scan_stats` is persisted, with no scanner-specific branching.
    const scanStats = rawItems.find(
      (item): item is { scan_stats: unknown } =>
        !!item && typeof item === "object" && "scan_stats" in item && !!(item as { scan_stats?: unknown }).scan_stats,
    )?.scan_stats;

    await db.scanJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resultCount: written + skipped,
        ...(scanStats ? { scanStats: scanStats as object } : {}),
      },
    });

    return { observationsWritten: written, observationsSkipped: skipped, errors, durationMs };

  } catch (err) {
    await db.scanJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

async function runEngine(sensorType: string, targets: string[]): Promise<unknown> {
  const engine = ENGINE_REGISTRY.get(sensorType);

  if (!engine) {
    throw new Error(
      `Unknown sensor type: ${sensorType}. Register an EngineDefinition in engine-registry.ts.`
    );
  }

  // Agent-deployed scanners cannot run server-side
  if (engine.requiresAgent) {
    throw new Error(
      `${sensorType} requires an on-premise sensor agent deployed inside the client network. ` +
      `Deploy the VERIQAS agent Docker container and assign it this scan job.`
    );
  }

  // Check availability before attempting to run
  const available = await engine.isAvailable();
  if (!available) {
    const inst = engine.installInstructions;
    const lines: string[] = [`${sensorType} is not installed on this system.`];
    if (inst.linux)   lines.push(`  linux:  ${inst.linux}`);
    if (inst.mac)     lines.push(`  mac:    ${inst.mac}`);
    if (inst.windows) lines.push(`  windows: ${inst.windows}`);
    if (inst.pip)     lines.push(`  pip:    ${inst.pip}`);
    if (inst.docker)  lines.push(`  docker: ${inst.docker}`);
    if (inst.url)     lines.push(`  url:    ${inst.url}`);
    throw new Error(lines.join("\n"));
  }

  // Scanners that need a git clone receive the cloned directory via options
  if (engine.requiresClone) {
    const repoUrl = targets.find(t =>
      t.startsWith("https://github.com/") ||
      t.startsWith("https://gitlab.com/") ||
      t.startsWith("http://github.com/")
    );
    if (!repoUrl) {
      throw new Error(
        `${sensorType} requires a git repository URL as target. ` +
        `Provide a GitHub or GitLab URL (e.g. https://github.com/org/repo).`
      );
    }
    const { dir, cleanup } = await cloneRepo(repoUrl);
    try {
      return await engine.run(targets, { clonedDir: dir });
    } finally {
      cleanup();
    }
  }

  return engine.run(targets);
}
