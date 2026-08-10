import { db } from "@/lib/db/client";

export interface PostureSummary {
  readinessScore: number;
  previousScore: number | null;
  scoreChange: number | null;
  overallRating: string;
  dimensions: { name: string; score: number; weight: number; label: string }[];
  riskCounts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  openActionCount: number;
  overdueActionCount: number;
  criticalActionCount: number;
  unownedAssetCount: number;
  liveVulnerableCount: number;
  totalCryptoAssets: number;
  quantumVulnerableCount: number;
  postQuantumCount: number;
  hybridCount: number;
  unknownClassCount: number;
  supplierCount: number;
  unassessedSupplierCount: number;
  criticalSupplierUnassessedCount: number;
  frameworkAlignments: {
    id: string;
    name: string;
    shortName: string;
    status: string;
    alignedPct: number;
    milestoneDate: Date | null;
  }[];
  topRisks: {
    id: string;
    ref: string;
    title: string;
    residualRating: string;
    status: string;
    businessService: string | null;
  }[];
  priorityActions: {
    id: string;
    ref: string;
    title: string;
    priority: string;
    dueDate: Date | null;
    status: string;
  }[];
  lastCalculatedAt: Date | null;
  confidence: string;
  recentScans: {
    id: string;
    ref: string;
    sensorType: string;
    sensorName: string;
    status: string;
    resultCount: number;
    completedAt: Date | null;
    targets: string[];
  }[];
  totalObservations: number;
  observationsByClass: {
    QUANTUM_VULNERABLE: number;
    QUANTUM_REDUCED_SECURITY: number;
    QUANTUM_RESILIENT: number;
    POST_QUANTUM: number;
    HYBRID: number;
    UNKNOWN: number;
  };
}

export async function getPostureSummary(tenantId: string): Promise<PostureSummary> {
  const [
    latestScore,
    riskCounts,
    actionStats,
    cryptoStats,
    supplierStats,
    frameworkAlignments,
    topRisks,
    priorityActions,
    observationStats,
    recentScans,
  ] = await Promise.all([
    // Latest readiness score
    db.readinessScore.findFirst({
      where: { tenantId },
      orderBy: { calculatedAt: "desc" },
    }),

    // Risk counts by residual rating
    db.risk.groupBy({
      by: ["residualRating"],
      where: { tenantId, isActive: true, status: { not: "CLOSED" } },
      _count: true,
    }),

    // Action stats
    db.action.groupBy({
      by: ["status", "priority"],
      where: { tenantId },
      _count: true,
    }),

    // Crypto asset stats
    db.cryptoAsset.groupBy({
      by: ["quantumClass"],
      where: { tenantId, isActive: true },
      _count: true,
    }),

    // Supplier stats
    db.supplier.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { criticality: true, lastAssessedAt: true },
    }),

    // Framework alignments
    db.frameworkAlignment.findMany({
      where: { tenantId },
      include: { framework: { select: { name: true, shortName: true, milestoneDate: true } } },
      orderBy: { calculatedAt: "desc" },
    }),

    // Top risks
    db.risk.findMany({
      where: {
        tenantId,
        isActive: true,
        status: { not: "CLOSED" },
        residualRating: { in: ["CRITICAL", "HIGH"] },
      },
      include: {
        businessServices: {
          include: { businessService: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: [{ residualRating: "asc" }, { priority: "desc" }],
      take: 8,
    }),

    // Priority actions
    db.action.findMany({
      where: {
        tenantId,
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "OVERDUE"] },
        priority: { in: ["CRITICAL", "HIGH"] },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 6,
    }),

    // Observation stats by quantum class (from scans)
    db.cryptoObservation.groupBy({
      by: ["quantumClass"],
      where: { tenantId, isActive: true },
      _count: true,
    }),

    // Recent scan jobs
    db.scanJob.findMany({
      where: { tenantId, status: { in: ["COMPLETED", "FAILED"] } },
      include: { sensor: { select: { sensorType: true, name: true } } },
      orderBy: { completedAt: "desc" },
      take: 6,
    }),
  ]);

  // Compute risk counts
  const rc = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const r of riskCounts) {
    const k = r.residualRating as keyof typeof rc;
    if (k in rc) rc[k] = r._count;
  }

  // Compute action stats
  let openActionCount = 0;
  let overdueActionCount = 0;
  let criticalActionCount = 0;
  for (const a of actionStats) {
    if (["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(a.status)) openActionCount += a._count;
    if (a.status === "OVERDUE") overdueActionCount += a._count;
    if (a.priority === "CRITICAL") criticalActionCount += a._count;
  }

  // Crypto stats (CryptoAsset inventory)
  const cryptoMap: Record<string, number> = {};
  let totalCryptoAssets = 0;
  for (const c of cryptoStats) {
    cryptoMap[c.quantumClass] = c._count;
    totalCryptoAssets += c._count;
  }

  // Observation stats (from scanner findings — fallback when no inventory exists)
  const obsMap: Record<string, number> = {};
  let totalObservations = 0;
  for (const o of observationStats) {
    obsMap[o.quantumClass] = o._count;
    totalObservations += o._count;
  }

  const unownedAssetCount = await db.cryptoAsset.count({
    where: { tenantId, isActive: true, ownerId: null },
  });

  const liveVulnerableCount = await db.cryptoAsset.count({
    where: {
      tenantId,
      isActive: true,
      liveObserved: true,
      quantumClass: "QUANTUM_VULNERABLE",
    },
  });

  // Supplier stats
  const unassessedSupplierCount = supplierStats.filter((s) => !s.lastAssessedAt).length;
  const criticalSupplierUnassessedCount = supplierStats.filter(
    (s) => s.criticality === "CRITICAL" && !s.lastAssessedAt
  ).length;

  // Framework alignments — deduplicate by framework
  const seen = new Set<string>();
  const frameworks: PostureSummary["frameworkAlignments"] = [];
  for (const fa of frameworkAlignments) {
    if (seen.has(fa.frameworkId)) continue;
    seen.add(fa.frameworkId);
    frameworks.push({
      id: fa.frameworkId,
      name: fa.framework.name,
      shortName: fa.framework.shortName,
      status: fa.status,
      alignedPct: fa.alignedPct,
      milestoneDate: fa.framework.milestoneDate,
    });
  }

  // Top risks
  const topRisksMapped = topRisks.map((r) => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    residualRating: r.residualRating,
    status: r.status,
    businessService: r.businessServices[0]?.businessService.name ?? null,
  }));

  // Dimensions from latest score — stored as {key: score} object, map to display format
  const dimensions = latestScore
    ? parseDimensions(latestScore.dimensions as Record<string, number> | { name: string; score: number; weight: number; label: string }[])
    : defaultDimensions();

  // Use crypto asset inventory if available, otherwise fall back to observation counts
  const qvCount = totalCryptoAssets > 0
    ? (cryptoMap["QUANTUM_VULNERABLE"] ?? 0)
    : (obsMap["QUANTUM_VULNERABLE"] ?? 0);
  const pqCount = totalCryptoAssets > 0
    ? (cryptoMap["POST_QUANTUM"] ?? 0)
    : (obsMap["POST_QUANTUM"] ?? 0);

  return {
    readinessScore: latestScore?.overallScore ?? 0,
    previousScore: latestScore?.previousScore ?? null,
    scoreChange: latestScore?.scoreChange ?? null,
    overallRating: latestScore?.overallRating ?? "CRITICAL_EXPOSURE",
    dimensions,
    riskCounts: rc,
    openActionCount,
    overdueActionCount,
    criticalActionCount,
    unownedAssetCount,
    liveVulnerableCount,
    totalCryptoAssets: totalCryptoAssets || totalObservations,
    quantumVulnerableCount: qvCount,
    postQuantumCount: pqCount,
    hybridCount: totalCryptoAssets > 0 ? (cryptoMap["HYBRID"] ?? 0) : (obsMap["HYBRID"] ?? 0),
    unknownClassCount: totalCryptoAssets > 0 ? (cryptoMap["UNKNOWN"] ?? 0) : (obsMap["UNKNOWN"] ?? 0),
    supplierCount: supplierStats.length,
    unassessedSupplierCount,
    criticalSupplierUnassessedCount,
    frameworkAlignments: frameworks,
    topRisks: topRisksMapped,
    priorityActions: priorityActions.map((a) => ({
      id: a.id,
      ref: a.ref,
      title: a.title,
      priority: a.priority,
      dueDate: a.dueDate,
      status: a.status,
    })),
    lastCalculatedAt: latestScore?.calculatedAt ?? null,
    confidence: latestScore?.confidence ?? "LOW",
    recentScans: recentScans.map((s) => ({
      id: s.id,
      ref: s.ref,
      sensorType: s.sensor.sensorType,
      sensorName: s.sensor.name,
      status: s.status,
      resultCount: s.resultCount ?? 0,
      completedAt: s.completedAt,
      targets: s.targets,
    })),
    totalObservations,
    observationsByClass: {
      QUANTUM_VULNERABLE:       obsMap["QUANTUM_VULNERABLE"] ?? 0,
      QUANTUM_REDUCED_SECURITY: obsMap["QUANTUM_REDUCED_SECURITY"] ?? 0,
      QUANTUM_RESILIENT:        obsMap["QUANTUM_RESILIENT"] ?? 0,
      POST_QUANTUM:             obsMap["POST_QUANTUM"] ?? 0,
      HYBRID:                   obsMap["HYBRID"] ?? 0,
      UNKNOWN:                  obsMap["UNKNOWN"] ?? 0,
    },
  };
}

const DIMENSION_META: Record<string, { name: string; weight: number }> = {
  cryptoVisibility: { name: "Cryptographic Visibility", weight: 0.15 },
  quantumExposure:  { name: "Quantum Exposure",         weight: 0.20 },
  dataLongevity:    { name: "Data Longevity Risk",       weight: 0.15 },
  migrationPrep:    { name: "Migration Preparedness",    weight: 0.20 },
  thirdParty:       { name: "Third-Party Readiness",     weight: 0.10 },
  governance:       { name: "Governance Maturity",       weight: 0.10 },
  cryptoAgility:    { name: "Cryptographic Agility",     weight: 0.10 },
};

function parseDimensions(
  raw: Record<string, number> | { name: string; score: number; weight: number; label: string }[]
): { name: string; score: number; weight: number; label: string }[] {
  if (Array.isArray(raw)) return raw;
  return Object.entries(raw).map(([key, score]) => {
    const meta = DIMENSION_META[key] ?? { name: key, weight: 0 };
    return { name: meta.name, score: score as number, weight: meta.weight, label: `${Math.round(meta.weight * 100)}%` };
  });
}

function defaultDimensions() {
  return [
    { name: "Cryptographic Visibility", score: 0, weight: 0.2, label: "20%" },
    { name: "Quantum Exposure", score: 0, weight: 0.2, label: "20%" },
    { name: "Data Longevity Risk", score: 0, weight: 0.15, label: "15%" },
    { name: "Migration Preparedness", score: 0, weight: 0.15, label: "15%" },
    { name: "Third-Party Readiness", score: 0, weight: 0.1, label: "10%" },
    { name: "Governance Maturity", score: 0, weight: 0.1, label: "10%" },
    { name: "Cryptographic Agility", score: 0, weight: 0.1, label: "10%" },
  ];
}
