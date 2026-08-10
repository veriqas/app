/**
 * Cryptographic Asset Inventory Service
 * Query layer for the /crypto-assets pages and API routes.
 */

import { db } from "@/lib/db/client";

export interface AssetSummary {
  id: string;
  ref: string;
  name: string;
  assetType: string | null;
  algorithm: string | null;
  primitiveType: string;
  quantumClass: string;
  migrationStatus: string;
  criticality: string;
  evidenceConfidence: number;
  sourceCount: number;
  liveObserved: boolean;
  firstSeenAt: Date | null;
  lastObservedAt: Date | null;
  host: string | null;
  repository: string | null;
  riskCount: number;
  businessServices: string[];
}

export interface AssetInventorySummary {
  total: number;
  byQuantumClass: Record<string, number>;
  byAssetType: Record<string, number>;
  byMigrationStatus: Record<string, number>;
  avgConfidence: number;
  liveObservedCount: number;
}

export async function getAssetInventory(
  tenantId: string,
  filters?: {
    quantumClass?: string[];
    assetType?: string;
    migrationStatus?: string;
    search?: string;
  }
): Promise<AssetSummary[]> {
  const where: Record<string, unknown> = { tenantId, isActive: true };
  if (filters?.quantumClass?.length) {
    where.quantumClass = { in: filters.quantumClass };
  }
  if (filters?.assetType) {
    where.assetType = filters.assetType;
  }
  if (filters?.migrationStatus) {
    where.migrationStatus = filters.migrationStatus;
  }
  if (filters?.search) {
    where.name = { contains: filters.search, mode: "insensitive" };
  }

  const assets = await db.cryptoAsset.findMany({
    where,
    include: {
      risks: { select: { riskId: true } },
      businessServices: {
        include: { businessService: { select: { name: true } } },
      },
      observations: {
        where: { isActive: true },
        select: { algorithm: true },
        take: 1,
        orderBy: { confidence: "desc" },
      },
    },
    orderBy: [
      { quantumClass: "asc" },       // QUANTUM_VULNERABLE first
      { evidenceConfidence: "desc" },
      { sourceCount: "desc" },
    ],
    take: 500,
  });

  return assets.map(a => ({
    id: a.id,
    ref: a.ref,
    name: a.name,
    assetType: a.assetType,
    algorithm: a.observations[0]?.algorithm ?? null,
    primitiveType: a.primitiveType,
    quantumClass: a.quantumClass,
    migrationStatus: a.migrationStatus,
    criticality: a.criticality,
    evidenceConfidence: a.evidenceConfidence,
    sourceCount: a.sourceCount,
    liveObserved: a.liveObserved,
    firstSeenAt: a.firstSeenAt,
    lastObservedAt: a.lastObservedAt,
    host: a.host,
    repository: a.repository,
    riskCount: a.risks.length,
    businessServices: a.businessServices.map(b => b.businessService.name),
  }));
}

export async function getAssetInventorySummary(
  tenantId: string
): Promise<AssetInventorySummary> {
  const [byQC, byType, byMigration, total, liveCount] = await Promise.all([
    db.cryptoAsset.groupBy({
      by: ["quantumClass"],
      where: { tenantId, isActive: true },
      _count: true,
    }),
    db.cryptoAsset.groupBy({
      by: ["assetType"],
      where: { tenantId, isActive: true },
      _count: true,
    }),
    db.cryptoAsset.groupBy({
      by: ["migrationStatus"],
      where: { tenantId, isActive: true },
      _count: true,
    }),
    db.cryptoAsset.count({ where: { tenantId, isActive: true } }),
    db.cryptoAsset.count({ where: { tenantId, isActive: true, liveObserved: true } }),
  ]);

  const avgResult = await db.cryptoAsset.aggregate({
    where: { tenantId, isActive: true },
    _avg: { evidenceConfidence: true },
  });

  const byQuantumClass: Record<string, number> = {};
  for (const r of byQC) byQuantumClass[r.quantumClass] = r._count;

  const byAssetType: Record<string, number> = {};
  for (const r of byType) byAssetType[r.assetType ?? "UNKNOWN"] = r._count;

  const byMigrationStatus: Record<string, number> = {};
  for (const r of byMigration) byMigrationStatus[r.migrationStatus] = r._count;

  return {
    total,
    byQuantumClass,
    byAssetType,
    byMigrationStatus,
    avgConfidence: Math.round(avgResult._avg.evidenceConfidence ?? 0),
    liveObservedCount: liveCount,
  };
}

export async function getAssetDetail(assetId: string, tenantId: string) {
  return db.cryptoAsset.findFirst({
    where: { id: assetId, tenantId },
    include: {
      observations: {
        where: { isActive: true },
        orderBy: [{ evidenceSource: "asc" }, { confidence: "desc" }],
        take: 50,
      },
      risks: {
        include: {
          risk: {
            select: {
              id: true, ref: true, title: true,
              residualRating: true, status: true,
            },
          },
        },
      },
      businessServices: {
        include: { businessService: { select: { id: true, name: true, criticality: true } } },
      },
      actions: {
        include: {
          action: {
            select: { id: true, ref: true, title: true, status: true, dueDate: true },
          },
        },
      },
    },
  });
}
