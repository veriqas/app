import { db } from "@/lib/db/client";

const DIMENSIONS = {
  cryptoVisibility: { name: "Cryptographic Visibility", weight: 0.15 },
  quantumExposure:  { name: "Quantum Exposure",         weight: 0.20 },
  dataLongevity:    { name: "Data Longevity Risk",       weight: 0.15 },
  migrationPrep:    { name: "Migration Preparedness",    weight: 0.20 },
  thirdParty:       { name: "Third-Party Readiness",     weight: 0.10 },
  governance:       { name: "Governance Maturity",       weight: 0.10 },
  cryptoAgility:    { name: "Cryptographic Agility",     weight: 0.10 },
} as const;

type DimensionKey = keyof typeof DIMENSIONS;

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function rating(score: number): string {
  if (score >= 85) return "STRONG";
  if (score >= 70) return "ADEQUATE";
  if (score >= 50) return "DEVELOPING";
  if (score >= 30) return "POOR";
  return "CRITICAL_EXPOSURE";
}

function confidence(totalAssets: number, totalObs: number, scansRun: number): string {
  const data = totalAssets + totalObs;
  if (data > 100 && scansRun >= 3) return "HIGH";
  if (data > 20 || scansRun >= 2) return "MEDIUM";
  if (data > 0 || scansRun >= 1) return "LOW";
  return "INSUFFICIENT_DATA";
}

export async function calculateAndStoreReadinessScore(tenantId: string): Promise<number> {
  const [
    assetGroups,
    obsGroups,
    risks,
    actions,
    suppliers,
    frameworks,
    scansCount,
  ] = await Promise.all([
    db.cryptoAsset.groupBy({ by: ["quantumClass"], where: { tenantId, isActive: true }, _count: true }),
    db.cryptoObservation.groupBy({ by: ["quantumClass"], where: { tenantId, isActive: true }, _count: true }),
    db.risk.findMany({ where: { tenantId, isActive: true, status: { not: "CLOSED" } }, select: { residualRating: true } }),
    db.action.findMany({ where: { tenantId }, select: { status: true, priority: true } }),
    db.supplier.findMany({ where: { tenantId, status: "ACTIVE" }, select: { criticality: true, lastAssessedAt: true, quantumReadinessRating: true, migrationPlanStatus: true } }),
    db.frameworkAlignment.findMany({ where: { tenantId }, select: { alignedPct: true, status: true } }),
    db.scanJob.count({ where: { tenantId, status: "COMPLETED" } }),
  ]);

  const assetMap: Record<string, number> = {};
  let totalAssets = 0;
  for (const g of assetGroups) { assetMap[g.quantumClass] = g._count; totalAssets += g._count; }

  const obsMap: Record<string, number> = {};
  let totalObs = 0;
  for (const g of obsGroups) { obsMap[g.quantumClass] = g._count; totalObs += g._count; }

  // Use whichever data source has more entries
  const useAssets = totalAssets >= totalObs;
  const dataMap = useAssets ? assetMap : obsMap;
  const totalData = useAssets ? totalAssets : totalObs;

  // 1. Cryptographic Visibility — how much of the estate is inventoried
  // Score rises with the number of observed/inventoried assets, capped when data > 500
  const visibilityScore = totalData === 0 ? 0 : clamp(Math.log10(totalData + 1) / Math.log10(501) * 100);

  // 2. Quantum Exposure — proportion of assets that are quantum-vulnerable (lower = better)
  const vulnerable = (dataMap["QUANTUM_VULNERABLE"] ?? 0) + (dataMap["QUANTUM_REDUCED_SECURITY"] ?? 0);
  const exposureScore = totalData === 0 ? 0 : clamp((1 - vulnerable / totalData) * 100);

  // 3. Data Longevity Risk — penalised by open CRITICAL/HIGH risks
  const critRisks = risks.filter(r => r.residualRating === "CRITICAL").length;
  const highRisks = risks.filter(r => r.residualRating === "HIGH").length;
  const riskPenalty = Math.min(100, critRisks * 15 + highRisks * 5);
  const longevityScore = clamp(100 - riskPenalty);

  // 4. Migration Preparedness — post-quantum / hybrid adoption rate
  const pq = (dataMap["POST_QUANTUM"] ?? 0) + (dataMap["HYBRID"] ?? 0);
  const migrationScore = totalData === 0 ? 0 : clamp((pq / totalData) * 100);

  // 5. Third-Party Readiness — supplier assessment coverage
  const critSuppliers = suppliers.filter(s => s.criticality === "CRITICAL");
  const assessedCrit = critSuppliers.filter(s => s.lastAssessedAt).length;
  const adequateCrit = critSuppliers.filter(s =>
    ["ADEQUATE", "STRONG"].includes(s.quantumReadinessRating ?? "") &&
    ["RECEIVED", "REVIEWED"].includes(s.migrationPlanStatus ?? "")
  ).length;
  const thirdPartyScore = critSuppliers.length === 0 ? 50
    : clamp((assessedCrit / critSuppliers.length) * 60 + (adequateCrit / critSuppliers.length) * 40);

  // 6. Governance Maturity — framework alignment
  const avgAlignment = frameworks.length === 0 ? 0
    : frameworks.reduce((sum, f) => sum + f.alignedPct, 0) / frameworks.length;
  const activeActions = actions.filter(a => ["OPEN","ASSIGNED","IN_PROGRESS","OVERDUE"].includes(a.status)).length;
  const closedActions = actions.filter(a => a.status === "CLOSED" || a.status === "COMPLETED").length;
  const actionCompletionRate = (activeActions + closedActions) === 0 ? 50
    : closedActions / (activeActions + closedActions) * 100;
  const governanceScore = clamp(avgAlignment * 0.6 + actionCompletionRate * 0.4);

  // 7. Cryptographic Agility — proportion of assets not locked to a single classical algo
  const resilient = (dataMap["QUANTUM_RESILIENT"] ?? 0) + (dataMap["POST_QUANTUM"] ?? 0) + (dataMap["HYBRID"] ?? 0);
  const agilityScore = totalData === 0 ? 0 : clamp((resilient / totalData) * 100);

  const scores: Record<DimensionKey, number> = {
    cryptoVisibility: visibilityScore,
    quantumExposure:  exposureScore,
    dataLongevity:    longevityScore,
    migrationPrep:    migrationScore,
    thirdParty:       thirdPartyScore,
    governance:       governanceScore,
    cryptoAgility:    agilityScore,
  };

  const overallScore = clamp(
    Object.entries(DIMENSIONS).reduce(
      (sum, [key, meta]) => sum + scores[key as DimensionKey] * meta.weight,
      0
    )
  );

  // Load previous score and active scoring policy in parallel
  const [prev, policy] = await Promise.all([
    db.readinessScore.findFirst({
      where: { tenantId },
      orderBy: { calculatedAt: "desc" },
      select: { overallScore: true },
    }),
    db.scoringPolicy.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true },
    }),
  ]);

  if (!policy) throw new Error(`No active ScoringPolicy found for tenant ${tenantId}`);

  const dimensionsJson: Record<string, number> = {};
  for (const key of Object.keys(DIMENSIONS) as DimensionKey[]) {
    dimensionsJson[key] = scores[key];
  }

  await db.readinessScore.create({
    data: {
      tenant:        { connect: { id: tenantId } },
      scoringPolicy: { connect: { id: policy.id } },
      overallScore,
      previousScore: prev?.overallScore ?? null,
      scoreChange:   prev != null ? overallScore - prev.overallScore : null,
      overallRating: rating(overallScore),
      confidence:    confidence(totalAssets, totalObs, scansCount),
      calculatedAt:  new Date(),
      dimensions:    dimensionsJson,
    },
  });

  return overallScore;
}
