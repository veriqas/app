// Verification scanner runner.
//
// Re-runs the RELEVANT scanners through the EXISTING PUBLIC engine interfaces and
// normalizes their output into ComparableFindings. It is strictly read-only
// against the scanner layer:
//   - consumes ENGINE_REGISTRY, engine.isAvailable/requiresClone/requiresAgent/run,
//     cloneRepo(), and processScanOutput()
//   - NEVER imports or calls writeObservations() — verification results never
//     touch the live observation store, and never recalculate scores.
//
// Dependencies are injectable so the entire flow can be unit/integration-tested
// with fake engines and no Docker.

import type { ScanContext, SenqorObservation } from "@/lib/sensors";
import { ENGINE_REGISTRY } from "@/lib/scanners/engine-registry";
import { processScanOutput } from "@/lib/sensors";
import { cloneRepo } from "@/lib/scanners/engines/git-clone";
import type { ComparableFinding } from "./comparator";

export type ScannerPhase = "BEFORE" | "AFTER";
export type ScannerRunStatus = "OK" | "UNAVAILABLE" | "ERROR" | "SKIPPED";

export interface EngineLike {
  requiresClone: boolean;
  requiresAgent: boolean;
  isAvailable: () => Promise<boolean>;
  run: (targets: string[], opts?: { clonedDir?: string }) => Promise<unknown>;
}

export interface ScannerRunnerDeps {
  getEngine: (sensorType: string) => EngineLike | undefined;
  cloneRepo: (repoUrl: string) => Promise<{ dir: string; cleanup: () => void }>;
  processScanOutput: (sensorType: string, raw: unknown, ctx: ScanContext) => SenqorObservation[];
}

// Real dependencies wire to the existing public scanner contracts.
export const realScannerRunnerDeps: ScannerRunnerDeps = {
  getEngine: (t) => ENGINE_REGISTRY.get(t) as unknown as EngineLike | undefined,
  cloneRepo,
  processScanOutput,
};

export interface ScannerRunOutcome {
  scanner: string;
  phase: ScannerPhase;
  status: ScannerRunStatus;
  findingCount: number;
  durationMs: number;
  error?: string;
}

export interface RunScannersResult {
  findings: ComparableFinding[];
  scannerResults: ScannerRunOutcome[];
  anyScannerFailed: boolean;
}

// Map a normalized observation to a comparison finding. Severity is derived from
// quantum classification purely for new-finding severity gating.
function severityFromQuantumClass(qc: string | undefined): string {
  switch ((qc ?? "").toUpperCase()) {
    case "QUANTUM_VULNERABLE": return "HIGH";
    case "QUANTUM_WEAKENED":
    case "QUANTUM_REDUCED_SECURITY": return "MEDIUM";
    default: return "LOW";
  }
}

function toComparable(o: SenqorObservation): ComparableFinding {
  return {
    scanner: o.sensorType,
    algorithm: o.algorithm ?? null,
    ruleId: null,
    filePath: o.filePath ?? null,
    dependency: o.packageName ?? null,
    severity: severityFromQuantumClass(o.quantumClass as unknown as string),
  };
}

export interface RunScannersParams {
  repoUrl: string;
  sensorTypes: string[];        // the RELEVANT scanners only
  tenantId: string;
  phase: ScannerPhase;
  clonedDir?: string;           // reuse an existing workspace (e.g. a patched tree)
}

/**
 * Run the relevant scanners for one verification phase. Failures are isolated
 * per scanner (one failing scanner does not abort the others).
 */
export async function runScannersForVerification(
  params: RunScannersParams,
  deps: ScannerRunnerDeps = realScannerRunnerDeps
): Promise<RunScannersResult> {
  const findings: ComparableFinding[] = [];
  const scannerResults: ScannerRunOutcome[] = [];
  let anyScannerFailed = false;

  for (const sensorType of params.sensorTypes) {
    const start = Date.now();
    const base = { scanner: sensorType, phase: params.phase };
    const engine = deps.getEngine(sensorType);

    if (!engine) {
      scannerResults.push({ ...base, status: "UNAVAILABLE", findingCount: 0, durationMs: 0, error: "No engine registered" });
      continue;
    }
    if (engine.requiresAgent) {
      scannerResults.push({ ...base, status: "SKIPPED", findingCount: 0, durationMs: 0, error: "Requires on-prem agent; not run server-side" });
      continue;
    }

    let available = false;
    try { available = await engine.isAvailable(); } catch { available = false; }
    if (!available) {
      scannerResults.push({ ...base, status: "UNAVAILABLE", findingCount: 0, durationMs: 0, error: "Scanner not installed/available" });
      continue;
    }

    let dir = params.clonedDir;
    let cleanup: (() => void) | null = null;
    try {
      if (engine.requiresClone && !dir) {
        const cloned = await deps.cloneRepo(params.repoUrl);
        dir = cloned.dir;
        cleanup = cloned.cleanup;
      }
      const ctx: ScanContext = {
        tenantId: params.tenantId,
        sensorType,
        evidenceSource: "STATIC_DETECTION",
        scannedAt: new Date(),
      };
      const raw = await engine.run([params.repoUrl], dir ? { clonedDir: dir } : undefined);
      const items = Array.isArray(raw) ? raw : [raw];
      const observations = items.flatMap(i => deps.processScanOutput(sensorType, i, ctx));
      const mapped = observations.map(toComparable);
      findings.push(...mapped);
      scannerResults.push({ ...base, status: "OK", findingCount: mapped.length, durationMs: Date.now() - start });
    } catch (err) {
      anyScannerFailed = true;
      scannerResults.push({ ...base, status: "ERROR", findingCount: 0, durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (cleanup) cleanup();
    }
  }

  return { findings, scannerResults, anyScannerFailed };
}
