/** What the policy decided, and how each attempt responded to it. */
import { db } from "@/lib/db/client";
const TENANT = process.env.E2E_TENANT!;

async function main() {
  const attempts = await db.remediationAttempt.findMany({
    where: { tenantId: TENANT }, orderBy: { createdAt: "asc" },
    select: {
      ref: true, attemptNumber: true, status: true, strategy: true, verdict: true,
      error: true, strategyPolicyVersion: true, policyJson: true,
      case: { select: { ref: true, algorithm: true, affectedFiles: true } },
    },
    take: 30,
  });
  for (const a of attempts) {
    const p = a.policyJson as unknown as {
      permittedStrategies?: string[]; prohibitedTargets?: string[];
      preferredStrategy?: string | null; classification?: Record<string, unknown>;
      rationale?: { rule: string; because: string }[];
    } | null;
    console.log(`\n${a.case.ref} [${a.case.algorithm}] ${a.case.affectedFiles.join(",")}`);
    console.log(`  attempt ${a.attemptNumber} ${a.ref}: status=${a.status} strategy=${a.strategy} verdict=${a.verdict ?? "-"} policy=${a.strategyPolicyVersion ?? "NONE"}`);
    if (p?.permittedStrategies) {
      console.log(`    permitted : ${p.permittedStrategies.join(", ")}`);
      console.log(`    preferred : ${p.preferredStrategy ?? "-"}`);
      console.log(`    class     : ${JSON.stringify(p.classification)}`);
      console.log(`    banned    : ${(p.prohibitedTargets ?? []).slice(0, 10).join(", ")}${(p.prohibitedTargets?.length ?? 0) > 10 ? " …" : ""}`);
      const key = (p.rationale ?? []).find(r => r.rule.startsWith("R2") || r.rule.startsWith("R3") || r.rule.startsWith("R10"));
      if (key) console.log(`    rule      : ${key.rule} — ${key.because}`);
    }
    if (a.error) console.log(`    error     : ${a.error.slice(0, 220)}`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error("ERR", e.message); process.exit(1); });
