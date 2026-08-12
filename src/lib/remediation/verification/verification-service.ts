// Verification orchestrator.
//
// Drives one VerificationRun through the state machine:
//   BASELINING -> (BUILDING/TESTING, gated) -> RESCANNING -> COMPARING -> verdict
// Establishes an immutable BEFORE baseline from the case's linked observations,
// re-runs the relevant scanners (read-only, via scanner-runner), optionally
// builds/tests in a sandbox, compares before/after, and records a deterministic
// verdict driven purely by scanner/build/test evidence.

import { db } from "@/lib/db/client";
import { reapOverdueRuns } from "./watchdog";
import {
  runScannersForVerification, realScannerRunnerDeps,
  type ScannerRunnerDeps,
} from "./scanner-runner";
import { runBuildAndTest, type SandboxExecutor, type BuildTestStatus } from "./build-test-runner";
import { compareFindings, type ComparableFinding } from "./comparator";
import { calculateVerdict } from "./verdict";

const DEFAULT_TIMEOUT_MS = 600_000;

function shortId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function severityFromQuantumClass(qc: string | undefined): string {
  switch ((qc ?? "").toUpperCase()) {
    case "QUANTUM_VULNERABLE": return "HIGH";
    case "QUANTUM_WEAKENED":
    case "QUANTUM_REDUCED_SECURITY": return "MEDIUM";
    default: return "LOW";
  }
}

export interface StartResult {
  run: { id: string; ref: string; status: string };
  reused: boolean;
}

/**
 * Idempotently start a verification run for a case. If a non-terminal run
 * already exists for the case, it is returned instead of creating a second
 * (prevents conflicting concurrent runs against the same workspace).
 */
export async function startVerification(caseId: string, tenantId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<StartResult> {
  await reapOverdueRuns(tenantId); // opportunistic watchdog

  const rc = await db.remediationCase.findFirst({ where: { id: caseId, tenantId }, select: { id: true, repoUrl: true } });
  if (!rc) throw new Error("RemediationCase not found");

  const active = await db.verificationRun.findFirst({
    where: {
      caseId, tenantId,
      status: { notIn: [
        "VERIFIED", "VERIFIED_WITH_WARNINGS", "FAILED", "REGRESSED",
        "BUILD_FAILED", "TEST_FAILED", "SCAN_FAILED",
        "TIMEOUT", "VERIFICATION_ERROR", "CANCELLED", "NO_BASELINE",
      ] },
    },
    select: { id: true, ref: true, status: true },
  });
  if (active) return { run: active, reused: true };

  const now = new Date();
  const run = await db.verificationRun.create({
    data: {
      ref: `VR-${shortId()}`,
      caseId, tenantId,
      repoUrl: rc.repoUrl,
      status: "PENDING",
      timeoutMs,
      deadlineAt: new Date(now.getTime() + timeoutMs),
    },
    select: { id: true, ref: true, status: true },
  });
  return { run, reused: false };
}

export interface ExecuteOptions {
  scannerDeps?: ScannerRunnerDeps;   // inject fakes for tests
  sandboxExecutor?: SandboxExecutor; // omitted => build/test SKIPPED (never PASS)
  workspaceRootFiles?: string[];     // manifest files for ecosystem detection
  workspaceDir?: string;             // patched workspace, if any
}

async function setStatus(runId: string, status: string, extra: Record<string, unknown> = {}) {
  await db.verificationRun.update({ where: { id: runId }, data: { status, ...extra } });
}

/**
 * Execute a verification run to a terminal verdict. Evidence-only: the verdict
 * is computed by calculateVerdict from scanner/build/test results — no AI input.
 */
export async function executeVerification(runId: string, opts: ExecuteOptions = {}): Promise<string> {
  const scannerDeps = opts.scannerDeps ?? realScannerRunnerDeps;
  const startedAt = new Date();

  const run = await db.verificationRun.findUnique({
    where: { id: runId },
    include: { case: { include: { findings: { include: { observation: true } } } } },
  });
  if (!run) throw new Error("VerificationRun not found");
  if (["VERIFIED", "VERIFIED_WITH_WARNINGS", "FAILED", "REGRESSED", "BUILD_FAILED", "TEST_FAILED", "SCAN_FAILED", "TIMEOUT", "VERIFICATION_ERROR", "CANCELLED", "NO_BASELINE"].includes(run.status)) {
    return run.status; // already terminal — idempotent
  }

  const finalize = async (state: string, reason: string, extra: Record<string, unknown> = {}) => {
    const finishedAt = new Date();
    await db.verificationRun.update({
      where: { id: runId },
      data: { status: state, verdictReason: reason, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), ...extra },
    });
    return state;
  };

  try {
    await setStatus(runId, "RUNNING", { startedAt });

    // 1. BASELINE (immutable) from the case's linked observations.
    await setStatus(runId, "BASELINING");
    const repoUrl = run.repoUrl ?? run.case.repoUrl;
    const relevantSensors = [...new Set(run.case.evidenceSources)];
    const baseline: ComparableFinding[] = run.case.findings.map(f => ({
      scanner: f.observation.sensorType,
      algorithm: f.observation.algorithm ?? null,
      ruleId: null,
      filePath: f.observation.filePath ?? null,
      dependency: f.observation.packageName ?? null,
      severity: severityFromQuantumClass(f.observation.quantumClass as unknown as string),
    }));

    if (baseline.length === 0) {
      return finalize("NO_BASELINE", "No baseline findings were captured; nothing to verify against.");
    }
    await db.verificationFinding.createMany({
      data: run.case.findings.map(f => ({
        verificationRunId: runId, phase: "BEFORE",
        scanner: f.observation.sensorType,
        fingerprint: `${f.observation.sensorType}|${(f.observation.algorithm ?? "").toLowerCase()}|${(f.observation.filePath ?? "").toLowerCase()}|${(f.observation.packageName ?? "").toLowerCase()}`,
        algorithm: f.observation.algorithm ?? null,
        normalizedLocation: f.observation.filePath ?? null,
        dependency: f.observation.packageName ?? null,
        severity: severityFromQuantumClass(f.observation.quantumClass as unknown as string),
        observationId: f.observationId,
      })),
    });

    if (!repoUrl) {
      return finalize("VERIFICATION_ERROR", "Case has no repository URL; cannot re-scan.");
    }

    // 2. BUILD / TEST (gated — SKIPPED unless a sandbox executor is provided).
    let buildStatus: BuildTestStatus = "NOT_RUN";
    let testStatus: BuildTestStatus = "NOT_RUN";
    if (opts.workspaceRootFiles) {
      await setStatus(runId, "BUILDING");
      const bt = await runBuildAndTest(
        { rootFiles: opts.workspaceRootFiles, workspaceDir: opts.workspaceDir ?? "", timeoutMs: run.timeoutMs },
        opts.sandboxExecutor,
      );
      buildStatus = bt.build.status;
      testStatus = bt.test.status;
      await setStatus(runId, "TESTING", { buildStatus, buildResult: bt.build as unknown as object, testStatus, testResult: bt.test as unknown as object });
      if (buildStatus === "FAIL") return finalize("BUILD_FAILED", "The project build failed after the change.", { buildStatus, testStatus });
      if (testStatus === "FAIL") return finalize("TEST_FAILED", "The project tests failed after the change.", { buildStatus, testStatus });
    }

    // 3. RE-SCAN relevant scanners (read-only; no observation writes).
    await setStatus(runId, "RESCANNING");
    const after = await runScannersForVerification(
      { repoUrl, sensorTypes: relevantSensors, tenantId: run.tenantId, phase: "AFTER", clonedDir: opts.workspaceDir },
      scannerDeps,
    );
    await db.verificationScannerResult.createMany({
      data: after.scannerResults.map(r => ({
        verificationRunId: runId, phase: "AFTER", scanner: r.scanner,
        status: r.status, findingCount: r.findingCount, durationMs: r.durationMs, error: r.error ?? null,
      })),
    });
    if (after.findings.length > 0) {
      await db.verificationFinding.createMany({
        data: after.findings.map(f => ({
          verificationRunId: runId, phase: "AFTER", scanner: f.scanner,
          fingerprint: `${f.scanner}|${(f.algorithm ?? "").toLowerCase()}|${(f.filePath ?? "").toLowerCase()}|${(f.dependency ?? "").toLowerCase()}`,
          algorithm: f.algorithm ?? null, normalizedLocation: f.filePath ?? null,
          dependency: f.dependency ?? null, severity: f.severity ?? null,
        })),
      });
    }

    // Infrastructure health: if no relevant scanner could run, we cannot verify.
    const ranOk = after.scannerResults.some(r => r.status === "OK");
    if (!ranOk) {
      return finalize("VERIFICATION_ERROR", "No relevant scanner could run (environment/Docker unavailable); reported as error, never verified.", { buildStatus, testStatus });
    }
    if (after.anyScannerFailed) {
      return finalize("SCAN_FAILED", "A relevant scanner failed during re-scan; cannot confirm resolution.", { buildStatus, testStatus });
    }

    // 4. COMPARE + verdict (deterministic, evidence-only).
    await setStatus(runId, "COMPARING");
    const comparison = compareFindings(baseline, after.findings);
    const verdict = calculateVerdict({ comparison, buildStatus, testStatus });
    return finalize(verdict.state, verdict.reason, {
      buildStatus, testStatus,
      summary: comparison.summary as unknown as object,
    });
  } catch (err) {
    return finalize("VERIFICATION_ERROR", err instanceof Error ? err.message : String(err));
  }
}
