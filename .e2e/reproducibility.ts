/**
 * Strategy reproducibility probe.
 *
 * Same case, same repository, same evidence — run the decision stages N times
 * and record what the planner chose. Measures whether the DECISION BOUNDARY is
 * stable, not whether the wording is identical.
 */
import { db } from "@/lib/db/client";
import { AnthropicAIClient } from "@/lib/remediation/agent/ai-client";
import { ContainerExecutionEnvironment } from "@/lib/remediation/agent/execution-environment";
import { acquireContext } from "@/lib/remediation/agent/context-acquirer";
import { investigate, analyzeRootCause, planRemediation, type CaseInfo } from "@/lib/remediation/agent/stages";
import { evaluateStrategyPolicy } from "@/lib/remediation/policy/strategy-policy";

const TENANT = process.env.E2E_TENANT!;
const CASE_PATH = process.argv[2];
const RUNS = Number(process.argv[3] ?? 5);

async function main() {
  const rc = await db.remediationCase.findFirst({
    where: { tenantId: TENANT, affectedFiles: { has: CASE_PATH } },
  });
  if (!rc) throw new Error(`no case for ${CASE_PATH}`);
  console.log(`case ${rc.ref} | ${rc.algorithm} | ${CASE_PATH} | runs=${RUNS}`);

  const firstObs = await db.remediationCaseFinding.findFirst({ where: { caseId: rc.id }, include: { observation: { select: { primitiveType: true, quantumClass: true } } } });
  const obsPrimitive = (firstObs?.observation?.primitiveType ?? null) as string | null;
  const obsQuantum = (firstObs?.observation?.quantumClass ?? null) as string | null;

  const ai = new AnthropicAIClient();
  const env = new ContainerExecutionEnvironment();
  const ws = await env.createWorkspace(rc.repoUrl!);
  const context = acquireContext({ workspaceDir: ws.dir, affectedFiles: rc.affectedFiles, affectedDependencies: rc.affectedDependencies });
  const caseInfo: CaseInfo = {
    ref: rc.ref, algorithm: rc.algorithm, purpose: rc.purpose, repoUrl: rc.repoUrl,
    affectedFiles: rc.affectedFiles, affectedDependencies: rc.affectedDependencies, evidenceSources: rc.evidenceSources,
  };

  const rows: { strategy: string; genuine: boolean; scope: string; conf: number; purpose: string }[] = [];
  const policySets: string[] = [];
  for (let i = 1; i <= RUNS; i++) {
    try {
      const inv = await investigate(ai, { caseInfo, context });
      const rca = await analyzeRootCause(ai, { caseInfo, investigation: inv.json });
      const policy = evaluateStrategyPolicy({
        algorithm: rc.algorithm, primitiveType: obsPrimitive, quantumClass: obsQuantum,
        evidenceSources: rc.evidenceSources, affectedDependencies: rc.affectedDependencies,
        operation: inv.json.operation ?? null, purposeRaw: inv.json.purpose ?? null,
        dataProtected: inv.json.dataProtected ?? null,
        isGenuine: typeof inv.json.isGenuine === "boolean" ? inv.json.isGenuine : null,
        scope: inv.json.scope === "SYSTEMIC" || inv.json.scope === "LOCAL" ? inv.json.scope : null,
        dependents: Array.isArray(inv.json.dependents) ? inv.json.dependents : [],
        confidence: typeof inv.json.confidence === "number" ? inv.json.confidence : null,
        migrationConstraints: Array.isArray(rca.json.migrationConstraints) ? rca.json.migrationConstraints : [],
      });
      policySets.push(policy.permittedStrategies.join(","));
      console.log(`  run ${i} POLICY permitted=[${policy.permittedStrategies.join(",")}] preferred=${policy.preferredStrategy} class=${policy.classification.purposeCategory}${policy.classification.escalated ? "(escalated)" : ""}`);
      const plan = await planRemediation(ai, { caseInfo, investigation: inv.json, rootCause: rca.json, policy });
      const j: Record<string, unknown> = inv.json as never;
      rows.push({
        strategy: (plan.json as { strategy: string }).strategy,
        genuine: Boolean(j.isGenuine), scope: String(j.scope),
        conf: Number(j.confidence), purpose: String(j.purpose).slice(0, 48),
      });
      console.log(`  run ${i}: strategy=${rows[i-1].strategy.padEnd(26)} genuine=${rows[i-1].genuine} scope=${String(rows[i-1].scope).padEnd(8)} conf=${rows[i-1].conf} purpose="${rows[i-1].purpose}"`);
    } catch (e) {
      console.log(`  run ${i}: ERROR ${(e as Error).message.slice(0, 90)}`);
    }
  }
  await env.destroyWorkspace(ws);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.strategy, (counts.get(r.strategy) ?? 0) + 1);
  console.log("\nSTRATEGY DISTRIBUTION:");
  for (const [s, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${s.padEnd(28)} ${n}/${rows.length}`);
  console.log("distinct strategies:", counts.size, counts.size === 1 ? "(STABLE)" : "(UNSTABLE)");
  console.log("distinct PERMITTED SETS:", new Set(policySets).size, new Set(policySets).size === 1 ? "(POLICY STABLE)" : `(POLICY VARIED: ${[...new Set(policySets)].join(" || ")})`);
  const scopes = new Set(rows.map(r => r.scope));
  const genuine = new Set(rows.map(r => r.genuine));
  console.log("distinct scope classifications:", [...scopes].join(","), "| isGenuine:", [...genuine].join(","));
  const confs = rows.map(r => r.conf);
  if (confs.length) console.log("confidence range:", Math.min(...confs), "-", Math.max(...confs));
}
main().then(() => process.exit(0)).catch(e => { console.error("ERR", e.message); process.exit(1); });
