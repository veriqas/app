// Integration test (requires local Postgres via DATABASE_URL; no Docker).
// Run: npx tsx --test src/lib/remediation/verification/__tests__/service.integration.test.ts
//
// Proves, against a real DB with injected FAKE scanners:
//   - baseline is established from case findings
//   - VERIFIED when re-scan shows the findings resolved
//   - FAILED when re-scan still shows the findings (scanner evidence wins)
//   - idempotency: a second start returns the same non-terminal run
//   - ISOLATION: verification never writes to the live CryptoObservation store
import { test, before, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db/client";
import type { ScannerRunnerDeps } from "../scanner-runner";
import type { SenqorObservation } from "@/lib/sensors";
import { startVerification, executeVerification } from "../verification-service";

const REPO = "https://github.com/acme/verify-demo";
let tenantId = "";
let caseId = "";

// Fake scanner deps: each engine returns the provided observations filtered to
// its sensor type. processScanOutput is a pass-through. cloneRepo is a no-op.
function fakeDeps(afterObs: Partial<SenqorObservation>[]): ScannerRunnerDeps {
  return {
    getEngine: (type: string) => ({
      requiresClone: false,
      requiresAgent: false,
      isAvailable: async () => true,
      run: async () => afterObs.filter(o => o.sensorType === type),
    }),
    cloneRepo: async () => ({ dir: "/tmp/fake-workspace", cleanup: () => {} }),
    processScanOutput: (_t: string, raw: unknown) => [raw as SenqorObservation],
  };
}

before(async () => {
  const t = await db.tenant.create({
    data: { slug: `verify-test-${Date.now()}`, name: "Verify Test", displayName: "Verify Test" },
    select: { id: true },
  });
  tenantId = t.id;
  const sensor = await db.sensor.create({ data: { tenantId, name: "vt-sensor", sensorType: "CRYPTOSCAN" } as never, select: { id: true } });
  const sj = await db.scanJob.create({
    data: { ref: `SJ-VT-${Date.now()}`, tenantId, sensorId: sensor.id, requestedBy: "test", status: "COMPLETED", targets: [REPO] } as never,
    select: { id: true },
  });
  const mkObs = (sensorType: string) => db.cryptoObservation.create({
    data: {
      ref: `OBS-VT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenantId, sensorType, evidenceSource: "STATIC_DETECTION" as never, observedAt: new Date(),
      algorithm: "RSA-2048", purpose: "DIGITAL_SIGNATURE", filePath: "src/auth/jwt.ts",
      quantumClass: "QUANTUM_VULNERABLE" as never, confidence: 90, scanJobId: sj.id,
    } as never,
    select: { id: true, sensorType: true },
  });
  const o1 = await mkObs("CRYPTOSCAN");
  const o2 = await mkObs("SEMGREP");

  const rc = await db.remediationCase.create({
    data: {
      ref: `RC-VT-${Date.now()}`, tenantId, title: "Verify RSA in jwt.ts", repoUrl: REPO,
      algorithm: "RSA-2048", purpose: "DIGITAL_SIGNATURE",
      correlationKey: `FILE|${REPO}|src/auth/jwt.ts|rsa-2048|digital_signature`,
      evidenceSources: ["CRYPTOSCAN", "SEMGREP"], affectedFiles: ["src/auth/jwt.ts"],
      affectedDependencies: [], confidence: 90, findingCount: 2, status: "OPEN",
    },
    select: { id: true },
  });
  caseId = rc.id;
  await db.remediationCaseFinding.createMany({
    data: [
      { caseId, observationId: o1.id, sensorType: "CRYPTOSCAN" },
      { caseId, observationId: o2.id, sensorType: "SEMGREP" },
    ],
  });
});

afterAll(async () => {
  // Clean up test data (child rows cascade from case/run deletes).
  await db.verificationRun.deleteMany({ where: { tenantId } });
  await db.remediationCase.deleteMany({ where: { tenantId } });
  await db.cryptoObservation.deleteMany({ where: { tenantId } });
  await db.scanJob.deleteMany({ where: { tenantId } });
  await db.sensor.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
  await db.$disconnect();
});

test("idempotency: two starts return the same non-terminal run", async () => {
  const a = await startVerification(caseId, tenantId);
  const b = await startVerification(caseId, tenantId);
  assert.equal(a.run.id, b.run.id, "second start must reuse the in-flight run");
  assert.equal(b.reused, true);
  // finalize this run so subsequent tests start fresh
  await db.verificationRun.update({ where: { id: a.run.id }, data: { status: "CANCELLED" } });
});

test("re-scan shows findings resolved → VERIFIED, and observations untouched", async () => {
  const obsBefore = await db.cryptoObservation.count({ where: { tenantId } });
  const { run } = await startVerification(caseId, tenantId);
  const state = await executeVerification(run.id, { scannerDeps: fakeDeps([]) }); // empty = resolved
  const obsAfter = await db.cryptoObservation.count({ where: { tenantId } });
  assert.equal(state, "VERIFIED");
  assert.equal(obsBefore, obsAfter, "verification must NOT write to the live observation store");
});

test("re-scan still shows the findings → FAILED (scanner evidence wins)", async () => {
  const stillPresent: Partial<SenqorObservation>[] = [
    { sensorType: "CRYPTOSCAN", algorithm: "RSA-2048", filePath: "src/auth/jwt.ts", quantumClass: "QUANTUM_VULNERABLE" as never },
    { sensorType: "SEMGREP", algorithm: "RSA-2048", filePath: "src/auth/jwt.ts", quantumClass: "QUANTUM_VULNERABLE" as never },
  ];
  const { run } = await startVerification(caseId, tenantId);
  const state = await executeVerification(run.id, { scannerDeps: fakeDeps(stillPresent) });
  assert.equal(state, "FAILED", "if the scanner still finds it, the verdict is FAILED even if AI claims fixed");
});

test("re-scan resolves original but introduces a new HIGH finding → REGRESSED", async () => {
  const newHigh: Partial<SenqorObservation>[] = [
    { sensorType: "CRYPTOSCAN", algorithm: "ECDSA", filePath: "src/auth/new.ts", quantumClass: "QUANTUM_VULNERABLE" as never },
  ];
  const { run } = await startVerification(caseId, tenantId);
  const state = await executeVerification(run.id, { scannerDeps: fakeDeps(newHigh) });
  assert.equal(state, "REGRESSED", "new HIGH/CRITICAL finding must block VERIFIED");
});
