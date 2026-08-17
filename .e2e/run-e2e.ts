/**
 * Cross-language remediation E2E harness.
 * Real Docker, real scanner, real case, real Claude, real patch, real re-scan.
 * Captures every artifact the milestone requires; asserts nothing it did not observe.
 */
import { db } from "@/lib/db/client";
import { executeScanJob } from "@/lib/scanners/worker";
import { buildRemediationCases } from "@/lib/remediation/case-builder";
import { runRemediation } from "@/lib/remediation/agent/orchestrator";
import { AnthropicAIClient } from "@/lib/remediation/agent/ai-client";
import { ContainerExecutionEnvironment } from "@/lib/remediation/agent/execution-environment";

const REPO = "https://github.com/veriqas/pqc-e2e-fixture";
const TENANT = process.env.E2E_TENANT!;
const SENSOR = process.argv[2];              // CRYPTOSCAN_AST | _PY | _JAVA
const PATHFILTER = process.argv[3] ?? "";    // only consider findings under this path
const LANG = process.argv[4] ?? SENSOR;

const line = (s = "") => console.log(s);
const h = (s: string) => { line(); line("=".repeat(70)); line(s); line("=".repeat(70)); };

async function main() {
  h(`E2E: ${LANG}  (sensor=${SENSOR}, path=${PATHFILTER || "*"})`);

  // Clean slate for this language only
  // Reset only THIS language's slice: its cases, and the observations under the
  // path filter. Other languages' cases still reference their own observations.
  const old = await db.remediationCase.findMany({ where: { tenantId: TENANT }, select: { id: true, affectedFiles: true } });
  for (const c of old) if (!PATHFILTER || c.affectedFiles.some(f => f.startsWith(PATHFILTER))) {
    await db.verificationRun.deleteMany({ where: { caseId: c.id } });
    await db.remediationAttempt.deleteMany({ where: { caseId: c.id } });
    await db.remediationCaseFinding.deleteMany({ where: { caseId: c.id } });
    await db.remediationCase.delete({ where: { id: c.id } });
  }
  const stale = await db.cryptoObservation.findMany({
    where: { tenantId: TENANT, sensorType: SENSOR, ...(PATHFILTER ? { filePath: { startsWith: PATHFILTER } } : {}) },
    select: { id: true },
  });
  const staleIds = stale.map(o => o.id);
  if (staleIds.length) {
    await db.remediationCaseFinding.deleteMany({ where: { observationId: { in: staleIds } } });
    await db.cryptoObservation.deleteMany({ where: { id: { in: staleIds } } });
  }

  // ── 1. SCAN (real scanner, real Docker) ────────────────────────────────
  let s = await db.sensor.findFirst({ where: { tenantId: TENANT, sensorType: SENSOR } });
  if (!s) s = await db.sensor.create({ data: { tenantId: TENANT, name: `E2E ${LANG}`, sensorType: SENSOR, isEnabled: true } });
  const job = await db.scanJob.create({ data: { ref: `SJ-E2E-${LANG}-${Date.now()}`, tenantId: TENANT, sensorId: s.id, requestedBy: "e2e", targets: [REPO], status: "PENDING" } });
  const scan = await executeScanJob(job.id);
  h("1. DETECTION");
  console.log("scan:", JSON.stringify(scan));
  const obs = await db.cryptoObservation.findMany({ where: { scanJobId: job.id },
    select: { ref:true, sensorType:true, algorithm:true, primitiveType:true, purpose:true, filePath:true, lineNumber:true, confidence:true, quantumClass:true, evidenceSource:true, context:true } });
  for (const o of obs) console.log(`  ${o.ref} | ${o.sensorType} | ${o.algorithm} | ${o.primitiveType} | purpose=${o.purpose} | ${o.filePath}:${o.lineNumber} | conf=${o.confidence} | ${o.quantumClass} | src=${o.evidenceSource}`);
  const decoy = obs.filter(o => /reporting|Reporting|labels/.test(o.filePath ?? ""));
  console.log("decoy findings (must be 0):", decoy.length);
  const stats = await db.scanJob.findUnique({ where: { id: job.id }, select: { scanStats: true } });
  console.log("scanStats:", JSON.stringify(stats?.scanStats));

  // ── 2. CASE ─────────────────────────────────────────────────────────────
  const corr = await buildRemediationCases(TENANT);
  h("2. REMEDIATION CASE");
  console.log("correlation:", JSON.stringify(corr));
  const cases = await db.remediationCase.findMany({ where: { tenantId: TENANT }, include: { findings: { include: { observation: { select: { filePath:true, lineNumber:true, algorithm:true } } } } } });
  const target = cases.find(c => !PATHFILTER || c.affectedFiles.some(f => f.startsWith(PATHFILTER)));
  if (!target) { console.log("NO CASE FOR THIS LANGUAGE — stopping"); return; }
  console.log(`  ref=${target.ref}\n  algorithm=${target.algorithm}\n  purpose=${target.purpose}\n  affectedFiles=${JSON.stringify(target.affectedFiles)}\n  evidenceSources=${JSON.stringify(target.evidenceSources)}\n  confidence=${target.confidence}\n  findingCount=${target.findingCount}\n  correlationKey=${target.correlationKey}`);
  for (const f of target.findings) console.log(`  linked finding: ${f.sensorType} ${f.observation?.algorithm} ${f.observation?.filePath}:${f.observation?.lineNumber}`);

  // ── 3-5. AI + PATCH + VERIFY (real Claude, real re-scan) ────────────────
  h("3. AI REMEDIATION (real Claude)");
  const t0 = Date.now();
  const out = await runRemediation(target.id, TENANT, { ai: new AnthropicAIClient(), env: new ContainerExecutionEnvironment() });
  console.log("elapsed(s):", ((Date.now()-t0)/1000).toFixed(0), "| outcome:", JSON.stringify(out));

  const attempts = await db.remediationAttempt.findMany({ where: { caseId: target.id }, orderBy: { attemptNumber: "asc" },
    include: { changes: true, stageResults: { select: { stage: true, error: true } } } });
  for (const a of attempts) {
    line();
    console.log(`ATTEMPT ${a.attemptNumber}: status=${a.status} strategy=${a.strategy} verdict=${a.verdict ?? "-"} runId=${a.verificationRunId ? "SET" : "NONE"}`);
    console.log(`  stages: ${a.stageResults.map(s=>s.stage + (s.error ? "(ERR)" : "")).join(" > ")}`);
    if (a.error) console.log(`  error: ${a.error.slice(0,200)}`);
    const inv: any = a.investigationJson, plan: any = a.planJson;
    if (inv) console.log(`  investigation: purpose=${inv.purpose} isGenuine=${inv.isGenuine} scope=${inv.scope} confidence=${inv.confidence} dependents=${JSON.stringify(inv.dependents)}`);
    if (plan) console.log(`  plan: strategy=${plan.strategy} files=${JSON.stringify(plan.affectedFiles)}`);
    for (const ch of a.changes) {
      console.log(`  CHANGE ${ch.filePath} type=${ch.changeType}`);
      console.log(`    originalHash=${ch.originalHash} patchedHash=${ch.patchedHash}`);
      console.log(`    reason=${(ch.reason ?? "").slice(0,220)}`);
      console.log((ch.diffPatch ?? "").split("\n").slice(0,18).map(l=>"      "+l).join("\n"));
    }
  }

  h("4. VERIFICATION (scanner evidence is authoritative)");
  const runs = await db.verificationRun.findMany({ where: { caseId: target.id }, include: { findings: true, scannerResults: true }, orderBy: { createdAt: "asc" } });
  console.log("verification runs:", runs.length);
  for (const r of runs) {
    const before = r.findings.filter(f=>f.phase==="BEFORE"), after = r.findings.filter(f=>f.phase==="AFTER");
    console.log(`  ${r.ref} VERDICT=${r.status} build=${r.buildStatus} test=${r.testStatus}`);
    console.log(`    reason: ${r.verdictReason}`);
    console.log(`    scanners: ${r.scannerResults.map(s=>`${s.scanner}:${s.status}(${s.findingCount})`).join(", ")}`);
    for (const f of before) console.log(`    BEFORE ${f.algorithm} @ ${f.normalizedLocation}  fp=${f.fingerprint}`);
    for (const f of after)  console.log(`    AFTER  ${f.algorithm} @ ${f.normalizedLocation}  fp=${f.fingerprint}`);
  }
  const finalCase = await db.remediationCase.findUnique({ where: { id: target.id }, select: { status: true } });
  h(`RESULT ${LANG}: finalStatus=${out.finalStatus} attempts=${out.attempts} caseStatus=${finalCase?.status} verificationRuns=${runs.length}`);
}
main().then(()=>process.exit(0)).catch(e=>{ console.error("E2E ERROR:", e.message); process.exit(1); });
