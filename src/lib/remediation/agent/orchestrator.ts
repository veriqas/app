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
import { evaluateStrategyPolicy } from "@/lib/remediation/policy/strategy-policy";
import { findProhibitedIntroductions, describeViolations } from "@/lib/remediation/policy/patch-policy-check";

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

  // Scanner-authoritative classification for the policy. Taken from the linked
  // observations, never from the AI: the policy must reason over evidence.
  const primitiveType = rc.findings.map(f => f.observation?.primitiveType).find(Boolean) as string | undefined;
  const quantumClass = rc.findings.map(f => f.observation?.quantumClass).find(Boolean) as string | undefined;

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
      // ── DETERMINISTIC STRATEGY POLICY ─────────────────────────────────────
      // Computed from evidence already established, with no AI involvement, and
      // recorded so the decision can be replayed. It bounds what the planner may
      // attempt; whether the result is actually safe remains the verifier's call.
      const policy = evaluateStrategyPolicy({
        algorithm: rc.algorithm,
        primitiveType: primitiveType ?? null,
        quantumClass: quantumClass ?? null,
        evidenceSources: rc.evidenceSources,
        affectedDependencies: rc.affectedDependencies,
        operation: inv.json.operation ?? null,
        purposeRaw: inv.json.purpose ?? rc.purpose ?? null,
        dataProtected: inv.json.dataProtected ?? null,
        isGenuine: typeof inv.json.isGenuine === "boolean" ? inv.json.isGenuine : null,
        scope: inv.json.scope === "SYSTEMIC" || inv.json.scope === "LOCAL" ? inv.json.scope : null,
        dependents: Array.isArray(inv.json.dependents) ? inv.json.dependents : [],
        confidence: typeof inv.json.confidence === "number" ? inv.json.confidence : null,
        migrationConstraints: Array.isArray(rca.json.migrationConstraints) ? rca.json.migrationConstraints : [],
      });
      await recordStage(attempt.id, "POLICY", { json: policy });
      await db.remediationAttempt.update({
        where: { id: attempt.id },
        data: { strategyPolicyVersion: policy.policyVersion, policyJson: policy as unknown as object },
      });

      const plan = await planRemediation(deps.ai, { caseInfo, investigation: inv.json, rootCause: rca.json, policy });
      await recordStage(attempt.id, "PLANNER", plan);
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { strategy: plan.json.strategy, planJson: plan.json as object } });

      // Enforcement, not trust: a strategy outside the permitted set is discarded.
      if (!policy.permittedStrategies.includes(plan.json.strategy)) {
        const msg = `OUT_OF_POLICY: planner selected ${plan.json.strategy}, which policy ${policy.policyVersion} does not permit for this case (permitted: ${policy.permittedStrategies.join(", ")}).`;
        await db.remediationAttempt.update({ where: { id: attempt.id }, data: { error: msg } });
        finalStatus = "OUT_OF_POLICY";
        await finalizeAttempt(attempt.id, "OUT_OF_POLICY");
        priorEvidence = { policyViolation: msg, policy };
        continue;
      }

      if (plan.json.strategy === "MANUAL_REVIEW") {
        finalStatus = "REVIEW";
        await finalizeAttempt(attempt.id, "REVIEW");
        break;
      }

      // PATCH
      await db.remediationAttempt.update({ where: { id: attempt.id }, data: { status: "PATCHING" } });
      const patch = await generatePatch(deps.ai, { plan: plan.json, context, policy });
      await recordStage(attempt.id, "PATCHER", patch);

      const readOriginal = (rel: string): string | null => {
        try { return fs.readFileSync(safeResolveInside(ws.dir, rel), "utf-8"); } catch { return null; }
      };
      const validated: ValidatedChange[] = [];
      for (const ch of patch.json.changes ?? []) {
        validated.push(validateChange(ch, readOriginal)); // throws on path traversal / binary / oversize
      }
      // Patch-content policy gate. The planner can satisfy the policy
      // syntactically while the generated code introduces a prohibited primitive
      // (the RSA -> "hybrid" -> Ed25519 path). Checked on the actual content,
      // before anything is applied or verified.
      const contentViolations = findProhibitedIntroductions(
        validated.map(v => ({ filePath: v.filePath, originalContent: v.originalContent ?? null, newContent: v.newContent ?? null })),
        policy.prohibitedTargets,
      );
      if (contentViolations.length > 0) {
        const msg = `OUT_OF_POLICY: the generated patch introduces prohibited cryptography — ${describeViolations(contentViolations)}. Rejected before verification under policy ${policy.policyVersion}.`;
        await db.remediationAttempt.update({ where: { id: attempt.id }, data: { error: msg } });
        finalStatus = "OUT_OF_POLICY";
        await finalizeAttempt(attempt.id, "OUT_OF_POLICY");
        priorEvidence = { policyViolation: msg, violations: contentViolations, policy };
        continue;
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
      let verdictReason: string;
      let summary: unknown = null;
      if (!ranOk) {
        const v = calculateVerdict({ infraError: true });
        verdictState = v.state; verdictReason = v.reason;
        evidence = { reason: v.reason, scannerResults: after.scannerResults };
      } else if (after.anyScannerFailed) {
        const v = calculateVerdict({ scanFailed: true, comparison: compareFindings(baseline, after.findings) });
        verdictState = v.state; verdictReason = v.reason;
        evidence = { reason: v.reason, scannerResults: after.scannerResults };
      } else {
        const comparison = compareFindings(baseline, after.findings, preScan.findings);
        const v = calculateVerdict({ comparison, buildStatus, testStatus });
        verdictState = v.state; verdictReason = v.reason; summary = comparison.summary;
        evidence = { reason: v.reason, summary: comparison.summary, buildStatus, testStatus, scannerResults: after.scannerResults };
      }

      // Persist the evidence behind this verdict as a VerificationRun. Without
      // this the before/after fingerprint comparison — the proof that the fix
      // worked — exists only in memory and never reaches the reviewer.
      const runId = await persistVerificationRun({
        caseId, tenantId, repoUrl: rc.repoUrl,
        baseline, after, buildStatus, testStatus,
        verdictState, verdictReason, summary,
      });

      await db.remediationAttempt.update({
        where: { id: attempt.id },
        data: { verdict: verdictState, verificationRunId: runId },
      });

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

/**
 * Persist the deterministic evidence behind an attempt's verdict as a
 * VerificationRun, mirroring what the standalone verification service records.
 * The AI never writes the verdict — this only stores what the scanners found,
 * so the reviewer can see the before/after fingerprint comparison that justifies
 * it. Failures here must never change the verdict, so they are swallowed.
 */
async function persistVerificationRun(args: {
  caseId: string;
  tenantId: string;
  repoUrl: string | null;
  baseline: ComparableFinding[];
  after: { findings: ComparableFinding[]; scannerResults: { scanner: string; status: string; findingCount: number; durationMs?: number; error?: string | null }[] };
  buildStatus: string;
  testStatus: string;
  verdictState: string;
  verdictReason: string;
  summary: unknown;
}): Promise<string | null> {
  const fp = (scanner: string, algorithm?: string | null, filePath?: string | null, dependency?: string | null) =>
    `${scanner}|${(algorithm ?? "").toLowerCase()}|${(filePath ?? "").toLowerCase()}|${(dependency ?? "").toLowerCase()}`;
  try {
    const now = new Date();
    const run = await db.verificationRun.create({
      data: {
        ref: `VR-${shortId()}`,
        caseId: args.caseId,
        tenantId: args.tenantId,
        repoUrl: args.repoUrl,
        status: args.verdictState,
        verdictReason: args.verdictReason,
        deadlineAt: now,
        startedAt: now,
        finishedAt: now,
        buildStatus: args.buildStatus,
        testStatus: args.testStatus,
        summary: (args.summary ?? undefined) as object | undefined,
      },
      select: { id: true },
    });
    if (args.baseline.length > 0) {
      await db.verificationFinding.createMany({
        data: args.baseline.map(f => ({
          verificationRunId: run.id, phase: "BEFORE", scanner: f.scanner,
          fingerprint: fp(f.scanner, f.algorithm, f.filePath, f.dependency),
          algorithm: f.algorithm ?? null, normalizedLocation: f.filePath ?? null,
          dependency: f.dependency ?? null, severity: f.severity ?? null,
        })),
      });
    }
    if (args.after.findings.length > 0) {
      await db.verificationFinding.createMany({
        data: args.after.findings.map(f => ({
          verificationRunId: run.id, phase: "AFTER", scanner: f.scanner,
          fingerprint: fp(f.scanner, f.algorithm, f.filePath, f.dependency),
          algorithm: f.algorithm ?? null, normalizedLocation: f.filePath ?? null,
          dependency: f.dependency ?? null, severity: f.severity ?? null,
        })),
      });
    }
    if (args.after.scannerResults.length > 0) {
      await db.verificationScannerResult.createMany({
        data: args.after.scannerResults.map(r => ({
          verificationRunId: run.id, phase: "AFTER", scanner: r.scanner,
          status: r.status, findingCount: r.findingCount,
          durationMs: r.durationMs ?? null, error: r.error ?? null,
        })),
      });
    }
    return run.id;
  } catch (e) {
    console.error("[remediation] failed to persist verification evidence:", e);
    return null;   // never let bookkeeping change the verdict
  }
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
