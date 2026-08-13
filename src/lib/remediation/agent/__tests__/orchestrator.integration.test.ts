// Integration test (local Postgres, mock AI + fake execution env; no Docker).
// Run: npx tsx --test src/lib/remediation/agent/__tests__/orchestrator.integration.test.ts
//
// Proves the staged loop end-to-end deterministically:
//   VERIFIED_WITH_WARNINGS (scanner clean, build/test SKIPPED),
//   FAILED (residual), REGRESSED (new HIGH), retry→giveUp, path-traversal rejected,
//   hard cap of 3 attempts, AI never sets the verdict.
import { test, before, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { db } from "@/lib/db/client";
import { runRemediation } from "../orchestrator";
import type { AIClient, AICompletion } from "../ai-client";
import type { RemediationExecutionEnvironment, Workspace } from "../execution-environment";
import type { RunScannersResult } from "@/lib/remediation/verification/scanner-runner";
import type { ComparableFinding } from "@/lib/remediation/verification/comparator";

const REPO = "https://github.com/acme/agent-demo";
let tenantId = "";
let caseId = "";

// ── Mock AI: canned structured output per stage; patch/diagnosis configurable ──
function mockAI(opts: { patchPath?: string; giveUp?: boolean } = {}): AIClient {
  const c = <T>(json: T): AICompletion<T> => ({ json, raw: "", model: "mock" });
  return {
    async completeJSON<T>(p: { stage: string }): Promise<AICompletion<T>> {
      switch (p.stage) {
        case "INVESTIGATOR": return c({ primitive: "RSA", algorithm: "RSA-2048", operation: "sign", purpose: "JWT", dataProtected: "tokens", isGenuine: true, dependents: [], scope: "LOCAL", confidence: 0.9 }) as AICompletion<T>;
        case "ROOT_CAUSE": return c({ rootCause: "RSA used for JWT signing", why: "auth", migrationConstraints: [] }) as AICompletion<T>;
        case "PLANNER": return c({ strategy: "CRYPTOGRAPHIC_MIGRATION", why: "PQC", affectedFiles: ["src/auth/jwt.ts"], affectedDependencies: [], expectedSecurityImprovement: "PQC", expectedCompatibilityImpact: "low", verificationRequirements: ["rescan"] }) as AICompletion<T>;
        case "PATCHER": return c({ changes: [{ filePath: opts.patchPath ?? "src/auth/jwt.ts", changeType: "MODIFY", newContent: "// migrated\n", reason: "swap alg" }], notes: "" }) as AICompletion<T>;
        case "DIAGNOSER": return c({ failureUnderstanding: "residual", whichEvidence: "scanner", revisedApproach: "retry", giveUp: !!opts.giveUp }) as AICompletion<T>;
        default: throw new Error("unexpected stage " + p.stage);
      }
    },
  };
}

// ── Fake execution env: real temp workspace; scanner findings are configurable ──
function fakeEnv(afterFindings: ComparableFinding[]): RemediationExecutionEnvironment {
  return {
    async createWorkspace(repoUrl: string): Promise<Workspace> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
      fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src", "auth", "jwt.ts"), "// original RSA\n");
      return { id: "ws", dir, repoUrl, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
    },
    async applyChanges() { /* no-op for test */ },
    async executeScanner(): Promise<RunScannersResult> {
      return {
        findings: afterFindings,
        scannerResults: ["CRYPTOSCAN", "SEMGREP"].map(s => ({ scanner: s, phase: "AFTER" as const, status: "OK" as const, findingCount: 0, durationMs: 1 })),
        anyScannerFailed: false,
      };
    },
    async executeBuild() { return { status: "SKIPPED" as const, reason: "no sandbox" }; },
    async executeTests() { return { status: "SKIPPED" as const, reason: "no sandbox" }; },
    async collectEvidence() { return { rootFiles: [] }; },
    async destroyWorkspace(ws: Workspace) { ws.cleanup(); },
  };
}

const RSA_JWT: ComparableFinding = { scanner: "CRYPTOSCAN", algorithm: "RSA-2048", ruleId: null, filePath: "src/auth/jwt.ts", dependency: null, severity: "HIGH" };

before(async () => {
  const t = await db.tenant.create({ data: { slug: `agent-${Date.now()}`, name: "Agent Test", displayName: "Agent Test" }, select: { id: true } });
  tenantId = t.id;
  const sensor = await db.sensor.create({ data: { tenantId, name: "s", sensorType: "CRYPTOSCAN" } as never, select: { id: true } });
  const sj = await db.scanJob.create({ data: { ref: `SJ-${Date.now()}`, tenantId, sensorId: sensor.id, requestedBy: "t", status: "COMPLETED", targets: [REPO] } as never, select: { id: true } });
  const mk = (st: string) => db.cryptoObservation.create({ data: { ref: `O-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, tenantId, sensorType: st, evidenceSource: "STATIC_DETECTION" as never, observedAt: new Date(), algorithm: "RSA-2048", purpose: "DIGITAL_SIGNATURE", filePath: "src/auth/jwt.ts", quantumClass: "QUANTUM_VULNERABLE" as never, confidence: 90, scanJobId: sj.id } as never, select: { id: true } });
  const o1 = await mk("CRYPTOSCAN"); const o2 = await mk("SEMGREP");
  const rc = await db.remediationCase.create({ data: { ref: `RC-${Date.now()}`, tenantId, title: "RSA jwt", repoUrl: REPO, algorithm: "RSA-2048", purpose: "DIGITAL_SIGNATURE", correlationKey: "k", evidenceSources: ["CRYPTOSCAN","SEMGREP"], affectedFiles: ["src/auth/jwt.ts"], affectedDependencies: [], confidence: 90, findingCount: 2, status: "OPEN" }, select: { id: true } });
  caseId = rc.id;
  await db.remediationCaseFinding.createMany({ data: [ { caseId, observationId: o1.id, sensorType: "CRYPTOSCAN" }, { caseId, observationId: o2.id, sensorType: "SEMGREP" } ] });
});

afterAll(async () => {
  await db.aIStageResult.deleteMany({ where: { attempt: { tenantId } } }).catch(() => {});
  await db.remediationChange.deleteMany({ where: { attempt: { tenantId } } }).catch(() => {});
  await db.remediationAttempt.deleteMany({ where: { tenantId } });
  await db.remediationCase.deleteMany({ where: { tenantId } });
  await db.cryptoObservation.deleteMany({ where: { tenantId } });
  await db.scanJob.deleteMany({ where: { tenantId } });
  await db.sensor.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
  await db.$disconnect();
});

test("scanner clean + build/test SKIPPED → VERIFIED_WITH_WARNINGS in one attempt", async () => {
  const out = await runRemediation(caseId, tenantId, { ai: mockAI(), env: fakeEnv([]) });
  assert.equal(out.finalStatus, "VERIFIED_WITH_WARNINGS");
  assert.equal(out.attempts, 1);
});

test("residual finding → FAILED, exhausts hard cap of 3 attempts", async () => {
  const out = await runRemediation(caseId, tenantId, { ai: mockAI(), env: fakeEnv([RSA_JWT]) });
  assert.equal(out.finalStatus, "FAILED");
  assert.equal(out.attempts, 3, "hard cap of 3 attempts");
});

test("original resolved but new HIGH finding → REGRESSED", async () => {
  const newHigh: ComparableFinding = { scanner: "CRYPTOSCAN", algorithm: "ECDSA", ruleId: null, filePath: "src/auth/new.ts", dependency: null, severity: "CRITICAL" };
  const out = await runRemediation(caseId, tenantId, { ai: mockAI(), env: fakeEnv([newHigh]) });
  assert.equal(out.finalStatus, "REGRESSED");
});

test("diagnoser giveUp=true stops early with ABANDONED", async () => {
  const out = await runRemediation(caseId, tenantId, { ai: mockAI({ giveUp: true }), env: fakeEnv([RSA_JWT]) });
  assert.equal(out.finalStatus, "ABANDONED");
  assert.equal(out.attempts, 1, "gave up after first failed attempt");
});

test("path traversal in a proposed patch is rejected (attempt ERROR)", async () => {
  const out = await runRemediation(caseId, tenantId, { ai: mockAI({ patchPath: "../../etc/passwd" }), env: fakeEnv([]) });
  assert.equal(out.finalStatus, "ERROR", "malicious path must abort the attempt, not be written");
});
