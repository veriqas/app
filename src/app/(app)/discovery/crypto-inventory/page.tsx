import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { PageShell } from "@/components/layout/page-shell";
import { CryptoInventoryClient } from "./client";

export default async function CryptoInventoryPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";
  if (!tenantId) return null;

  const [assets, users] = await Promise.all([
    db.cryptoAsset.findMany({
      where: { tenantId, isActive: true },
      include: {
        algorithm: { select: { name: true, family: true } },
        businessServices: { include: { businessService: { select: { name: true } } } },
        risks: { select: { riskId: true } },
        observations: {
          where: { isActive: true },
          select: { algorithm: true, sensorType: true },
          take: 20,
          orderBy: { confidence: "desc" },
        },
      },
      orderBy: [{ quantumClass: "asc" }, { evidenceConfidence: "desc" }, { ref: "asc" }],
      take: 500,
    }),
    db.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const [total, vulnerable, liveVulnerable, postQuantum, unowned, multiSource] = await Promise.all([
    db.cryptoAsset.count({ where: { tenantId, isActive: true } }),
    db.cryptoAsset.count({ where: { tenantId, isActive: true, quantumClass: "QUANTUM_VULNERABLE" } }),
    db.cryptoAsset.count({ where: { tenantId, isActive: true, quantumClass: "QUANTUM_VULNERABLE", liveObserved: true } }),
    db.cryptoAsset.count({ where: { tenantId, isActive: true, quantumClass: "POST_QUANTUM" } }),
    db.cryptoAsset.count({ where: { tenantId, isActive: true, ownerId: null } }),
    db.cryptoAsset.count({ where: { tenantId, isActive: true, sourceCount: { gte: 2 } } }),
  ]);

  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.id]));

  const serialized = assets.map((a) => {
    const distinctSources = [...new Set(a.observations.map(o => o.sensorType))];
    const topAlgo = a.observations[0]?.algorithm ?? a.algorithm?.name ?? null;
    return {
      id: a.id,
      ref: a.ref,
      name: a.name,
      purpose: a.purpose,
      primitiveType: a.primitiveType,
      algorithm: topAlgo,
      algorithmFamily: a.algorithm?.family ?? null,
      environment: a.environment,
      provider: a.provider,
      protocol: a.protocol,
      quantumClass: a.quantumClass,
      liveObserved: a.liveObserved,
      riskLevel: a.riskLevel,
      ownerId: a.ownerId,
      ownerName: a.ownerId ? (userMap[a.ownerId] ?? null) : null,
      evidenceConfidence: a.evidenceConfidence,
      lastObservedAt: a.lastObservedAt?.toISOString() ?? null,
      firstSeenAt: a.firstSeenAt?.toISOString() ?? null,
      businessServices: a.businessServices.map((b) => b.businessService.name),
      assetType: a.assetType,
      host: a.host,
      repository: a.repository,
      migrationStatus: a.migrationStatus,
      criticality: a.criticality,
      sourceCount: a.sourceCount,
      sources: distinctSources,
      riskCount: a.risks.length,
    };
  });

  return (
    <PageShell
      title="Cryptographic Asset Inventory"
      breadcrumbs={[{ label: "Discovery" }, { label: "Crypto Inventory" }]}
    >
      <CryptoInventoryClient
        assets={serialized}
        users={users.map(u => ({ id: u.id, name: u.name ?? u.id }))}
        kpis={{ total, vulnerable, liveVulnerable, postQuantum, unowned, multiSource }}
      />
    </PageShell>
  );
}
