// AI Remediation V2 orchestrator.
//
// Drives up to MAX_ATTEMPTS (3) staged attempts per RemediationCase:
//   investigate -> root-cause -> plan -> patch -> apply(workspace) -> verify
//   -> (on failure) diagnose -> retry
// The AI proposes; the DETERMINISTIC core (comparator + calculateVerdict) decides.
// The AI can never set a VERIFIED verdict and can never raise the attempt cap.
// Runs entirely through the injected RemediationExecutionEnvironment and AIClient,
// so it is testable with fakes and maps onto the existing container in production.

import * as fs from "fs";
import { db } from "@/lib/db/client";
import type { AIClient } from "./ai-client";
import type { RemediationExecutionEnvironment, AppliedChange } from "./execution-environment";
import { safeResolveInside } from "./execution-environment";
import { acquireContext } from "./context-acquirer";
import { investigate, analyzeRootCause, planRemediation, generatePatch, diagnoseFailure, type CaseInfo } from "./stages";
import { validateChange, type ValidatedChange } from "./patch-safety";
import { compareFindings, type ComparableFinding } from "@/lib/remediation/verification/comparator";
import { calculateVerdict, type BuildTestStatus } from "@/lib/remediation/verification/verdict";

export const MAX_ATTEMPTS = 3;

function shortId(): string { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

function severityFromQuantumClass(qc: string | undefined): string {
  switch ((qc ?? "").toUpperCase()) {
    case "QUANTUM_VULNERABLE": return "HIGH";
    case "QUANTUM_WEAKENED":
    case "QUANTUM_REDUCED_SECURITY": return "MEDIUM";
    default: return "LOW";
  }
}

export interface RunRemediationDeps {
  ai: AIClient;
  env: RemediationExecutionEnvironment;
  maxAttempts?: number; // hard-capped at MAX_ATTEMPTS regardless of caller
}

export interface RemediationOutcome {
  caseId: string;
  attempts: number;
  finalStatus: string;   // terminal attempt status
  attemptIds: string[];
}

export async function runRemediation(caseId: string, tenantId: string, deps: RunRemediationDeps): Promise<RemediationOutcome> {
  const cap = Math.min(deps.maxAttempts ?? MAX_ATTEMPTS, MAX_ATTEMPTS); // AI/caller cannot exceed the cap

  const rc = await db.remediationCase.findFirst({
    where: { id: caseId, tenantId },
    include: { findings: { include: { observation: true } } },
  });
  if (!rc) throw new Error("RemediationCase not found");
  if (!rc.repoUrl) throw new Error("Case has no repository URL");

  const caseInfo: CaseInfo = {
    ref: rc.ref, algorithm: rc.algorithm, purpose: rc.purpose, repoUrl: rc.repoUrl,
    affectedFiles: rc.affectedFiles, affectedDependencies: rc.affectedDependencies,
    evidenceSources: rc.evidenceSources,
  };
  const baseline: ComparableFinding[] = rc.findings.map(f => ({
    scanner: f.observation.sensorType, algorithm: f.observation.algorithm ?? null, ruleId: null,
    filePath: f.observation.filePath ?? null, dependency: f.observation.packageName ?? null,
    severity: severityFromQuantumClass(f.observation.quantumClass as unknown as string),
  }));
  const relevantSensors = [...new Set(rc.evidenceSources)];

  const attemptIds: string[] = [];
  let priorEvidence: unknown = null;
  let finalStatus = "FAILED";

  for (let n = 1; n <= cap; n++) {
    const attempt = await db.remediationAttempt.create({
      data: { ref: `RA-${shortId()}`, caseId, tenantId, attemptNumber: n, status: "PENDING" },
      select: { id: true },
    });
    attemptIds.push(attempt.id);
    const ws = await deps.env.createWorkspace(rc.repoUrl);

    try {
      // Context
      const context = acquireContext({ workspaceDir: ws.dir, affectedFiles: caseInfo.affectedFiles, affectedDependencies: caseInfo.affectedDependencies });

      // INVESTIGATE -> ROOT_CAUSE -> PLAN
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { status: "INVESTIGATING" } });
      const inv = await investigate(deps.ai, { caseInfo, context });
      await recordStage(attempt.id, "INVESTIGATOR", inv);
      const rca = await analyzeRootCause(deps.ai, { caseInfo, investigation: inv.json });
      await recordStage(attempt.id, "ROOT_CAUSE", rca);
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { status: "PLANNING", investigationJson: inv.json as object, rootCauseJson: rca.json as object } });
      const plan = await planRemediation(deps.ai, { caseInfo, investigation: inv.json, rootCause: rca.json });
      await recordStage(attempt.id, "PLANNER", plan);
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { strategy: plan.json.strategy, planJson: plan.json as object } });

      if (plan.json.strategy === "MANUAL_REVIEW") {
        finalStatus = "REVIEW";
        await finalizeAttempt(attempt.id, "REVIEW");
        break;
      }

      // PATCH
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { status: "PATCHING" } });
      const patch = await generatePatch(deps.ai, { plan: plan.json, context });
      await recordStage(attempt.id, "PATCHER", patch);

      const readOriginal = (rel: string): string | null => {
        try { return fs.readFileSync(safeResolveInside(ws.dir, rel), "utf-8"); } catch { return null; }
      };
      const validated: ValidatedChange[] = [];
      for (const ch of patch.json.changes ?? []) {
        validated.push(validateChange(ch, readOriginal)); // throws on path traversal / binary / oversize
      }
      await db.remediationChange.createMany({
        data: validated.map(v => ({
          attemptId: attempt.id, filePath: v.filePath, changeType: v.changeType,
          originalHash: v.originalHash, patchedHash: v.patchedHash,
          originalContent: v.originalContent?.slice(0, 20000) ?? null,
          patchedContent: v.newContent?.slice(0, 20000) ?? null,
          diffPatch: v.diffPatch.slice(0, 40000), reason: v.reason ?? null,
        })),
      });
      // Pre-patch full scan of the CLEAN workspace. This captures findings that
      // already existed (elsewhere in the repo), so the after/before comparison
      // never misattributes a pre-existing unrelated finding as newly introduced.
      const preScan = await deps.env.executeScanner(ws, relevantSensors, tenantId);

      const applied: AppliedChange[] = validated.map(v => ({ filePath: v.filePath, changeType: v.changeType, newContent: v.newContent }));
      await deps.env.applyChanges(ws, applied);

      // VERIFY (deterministic; scanner evidence decides)
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { status: "VERIFYING" } });
      const build = await deps.env.executeBuild(ws);
      const test = await deps.env.executeTests(ws);
      const buildStatus = build.status as BuildTestStatus;
      const testStatus = test.status as BuildTestStatus;
      const after = await deps.env.executeScanner(ws, relevantSensors, tenantId);

      const ranOk = after.scannerResults.some(r => r.status === "OK");
      let verdictState: string;
      let evidence: unknown;
      if (!ranOk) {
        const v = calculateVerdict({ infraError: true });
        verdictState = v.state; evidence = { reason: v.reason, scannerResults: after.scannerResults };
      } else if (after.anyScannerFailed) {
        const v = calculateVerdict({ scanFailed: true, comparison: compareFindings(baseline, after.findings) });
        verdictState = v.state; evidence = { reason: v.reason, scannerResults: after.scannerResults };
      } else {
        const comparison = compareFindings(baseline, after.findings, preScan.findings);
        const v = calculateVerdict({ comparison, buildStatus, testStatus });
        verdictState = v.state; evidence = { reason: v.reason, summary: comparison.summary, buildStatus, testStatus, scannerResults: after.scannerResults };
      }

      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { verdict: verdictState } });

      if (verdictState === "VERIFIED" || verdictState === "VERIFIED_WITH_WARNINGS") {
        finalStatus = verdictState;
        await finalizeAttempt(attempt.id, "REVIEW"); // success → human review gate before any real apply
        break;
      }

      // Failure → diagnose (if attempts remain), then retry.
      finalStatus = verdictState;
      await finalizeAttempt(attempt.id, verdictState);
      priorEvidence = evidence;
      if (n < cap) {
        const diag = await diagnoseFailure(deps.ai, { plan: plan.json, evidence: priorEvidence });
        await recordStage(attempt.id, "DIAGNOSER", diag);
        await db.remediationAttempt.update({ where: { id: attempt.id }, data: { diagnosisJson: diag.json as object } });
        if (diag.json.giveUp) { finalStatus = "ABANDONED"; break; }
      }
    } catch (err) {
      finalStatus = "ERROR";
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { status: "ERROR", error: err instanceof Error ? err.message : String(err) } });
    } finally {
      await deps.env.destroyWorkspace(ws);
    }
  }

  return { caseId, attempts: attemptIds.length, finalStatus, attemptIds };
}

async function recordStage(attemptId: string, stage: string, res: { json: unknown; model?: string; promptTokens?: number; completionTokens?: number }) {
  await db.aIStageResult.create({
    data: {
      attemptId, stage, model: res.model ?? "unknown",
      promptTokens: res.promptTokens ?? null, completionTokens: res.completionTokens ?? null,
      structuredJson: res.json as object,
    },
  });
}

async function finalizeAttempt(attemptId: string, status: string) {
  await db.remediationAttempt.update({ where: { id: attemptId }, data: { status } });
}
