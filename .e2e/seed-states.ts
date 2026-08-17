/**
 * Populate one case per operational state so the Case Log can be checked against
 * every branch it renders. Uses the real engines end to end — the only thing
 * forced is which AI response the orchestrator receives, so that the
 * policy-blocked and failure paths can be observed deterministically.
 */
import { db } from "@/lib/db/client";
import { executeScanJob } from "@/lib/scanners/worker";
import { buildRemediationCases } from "@/lib/remediation/case-builder";
import { runRemediation } from "@/lib/remediation/agent/orchestrator";
import { ContainerExecutionEnvironment } from "@/lib/remediation/agent/execution-environment";
import type { AIClient, AICompletion } from "@/lib/remediation/agent/ai-client";

const TENANT = process.env.E2E_TENANT!;
const REPO = "https://github.com/veriqas/pqc-e2e-fixture";

/** Scripted AI so a specific branch can be exercised. Engines are untouched. */
function scriptedAI(opts: { strategy: string; patchContent: string; purpose: string }): AIClient {
  const c = <T,>(json: T): AICompletion<T> => ({ json, raw: "", model: "scripted" });
  return {
    async completeJSON<T>(p: { stage: string }): Promise<AICompletion<T>> {
      switch (p.stage) {
        case "INVESTIGATOR": return c({ primitive: "RSA", algorithm: "RSA-2048", operation: "sign", purpose: opts.purpose, dataProtected: "authentication tokens", isGenuine: true, dependents: ["signAuthToken"], scope: "SYSTEMIC", confidence: 0.9 }) as AICompletion<T>;
        case "ROOT_CAUSE":   return c({ rootCause: "RSA-2048 signs authentication tokens.", why: "asymmetric issuer/verifier split", migrationConstraints: [] }) as AICompletion<T>;
        case "PLANNER":      return c({ strategy: opts.strategy, why: "scripted", affectedFiles: ["src/auth/jwt.ts"], affectedDependencies: [], expectedSecurityImprovement: "scripted", expectedCompatibilityImpact: "low", verificationRequirements: ["rescan"] }) as AICompletion<T>;
        case "PATCHER":      return c({ changes: [{ filePath: "src/auth/jwt.ts", changeType: "MODIFY", newContent: opts.patchContent, reason: "scripted" }], notes: "" }) as AICompletion<T>;
        case "DIAGNOSER":    return c({ failureUnderstanding: "residual", whichEvidence: "scanner", revisedApproach: "retry", giveUp: true }) as AICompletion<T>;
        default: throw new Error("unexpected stage " + p.stage);
      }
    },
  };
}

async function scan(sensorType: string) {
  let s = await db.sensor.findFirst({ where: { tenantId: TENANT, sensorType } });
  if (!s) s = await db.sensor.create({ data: { tenantId: TENANT, name: `E2E ${sensorType}`, sensorType, isEnabled: true } });
  const job = await db.scanJob.create({ data: { ref: `SJ-E2E-${sensorType}-${Date.now()}`, tenantId: TENANT, sensorId: s.id, requestedBy: "e2e", targets: [REPO], status: "PENDING" } });
  await executeScanJob(job.id);
}

async function main() {
  await scan("CRYPTOSCAN_AST");
  await scan("CRYPTOSCAN_AST_PY");
  await buildRemediationCases(TENANT);

  const cases = await db.remediationCase.findMany({ where: { tenantId: TENANT }, select: { id: true, ref: true, algorithm: true, affectedFiles: true } });
  const rsa = cases.find(c => c.affectedFiles.some(f => f.includes("auth/jwt")));
  const py  = cases.find(c => c.affectedFiles.some(f => f.startsWith("python/")));
  const env = new ContainerExecutionEnvironment();

  // POLICY BLOCKED — a permitted strategy whose patch introduces Ed25519.
  if (rsa) {
    const out = await runRemediation(rsa.id, TENANT, {
      ai: scriptedAI({
        strategy: "CRYPTOGRAPHIC_MIGRATION", purpose: "JWT authentication signing",
        patchContent: "import { ed25519 } from '@noble/curves/ed25519';\nexport const signAuthToken = (c) => ed25519.sign(c, key);\n",
      }),
      env,
    });
    console.log(`RSA case ${rsa.ref}: ${out.finalStatus}`);
  }

  // MANUAL REVIEW — planner declines.
  if (py) {
    const out = await runRemediation(py.id, TENANT, {
      ai: scriptedAI({ strategy: "MANUAL_REVIEW", purpose: "session token integrity", patchContent: "" }),
      env,
    });
    console.log(`Python case ${py.ref}: ${out.finalStatus}`);
  }

  const final = await db.remediationCase.findMany({
    where: { tenantId: TENANT },
    select: { ref: true, algorithm: true, attempts: { select: { status: true, strategy: true } }, verificationRuns: { select: { status: true } } },
  });
  console.log("\n=== case states ===");
  for (const c of final) {
    const a = c.attempts[c.attempts.length - 1];
    console.log(`  ${c.ref} ${String(c.algorithm).padEnd(10)} attempts=${c.attempts.length} last=${a?.status ?? "-"}/${a?.strategy ?? "-"} verdict=${c.verificationRuns[0]?.status ?? "-"}`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error("ERR", e.message); process.exit(1); });
