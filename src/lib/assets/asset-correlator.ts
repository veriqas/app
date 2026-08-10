/**
 * Cryptographic Asset Correlator
 *
 * The core of the asset-centric architecture.
 * Converts SenqorObservations into CryptoAsset records — the platform's
 * primary source of truth. Multiple scanners observing the same logical asset
 * converge into a single CryptoAsset with aggregated confidence.
 *
 * How it works:
 *   1. Derive a deterministic fingerprint from the observation's location
 *   2. Upsert a CryptoAsset for that fingerprint
 *   3. Return the asset ID so the observation can be linked via cryptoAssetId
 *   4. After all observations for a job are written, updateAssetConfidence()
 *      aggregates multi-source evidence into a final evidenceConfidence score
 */

import { db } from "@/lib/db/client";
import type { SenqorObservation, ScanContext } from "@/lib/sensors/types/observation";
import { SOURCE_RANK } from "./confidence-aggregator";

// ── Asset type classification ─────────────────────────────────────────────────

export type AssetType =
  | "TLS_ENDPOINT"
  | "SSH_ENDPOINT"
  | "CODE_USAGE"
  | "LIBRARY"
  | "CONTAINER"
  | "CERTIFICATE"
  | "GENERIC";

export function deriveAssetType(obs: SenqorObservation): AssetType {
  if (obs.endpoint) {
    const proto = (obs.protocol ?? "").toLowerCase();
    if (proto.includes("ssh")) return "SSH_ENDPOINT";
    return "TLS_ENDPOINT";
  }
  if (obs.packageName) return "LIBRARY";
  if (obs.filePath) return "CODE_USAGE";
  if (obs.primitiveType === "CERTIFICATE") return "CERTIFICATE";
  return "GENERIC";
}

// ── Host extraction ────────────────────────────────────────────────────────────

export function extractHost(obs: SenqorObservation): string | undefined {
  if (obs.endpoint) {
    // endpoint is "host:port" or "host"
    return obs.endpoint.split(":")[0];
  }
  if (obs.filePath) {
    // Try to extract repo host from a path like "/tmp/.../github.com/org/repo/..."
    const match = obs.filePath.match(/github\.com\/[^/]+\/[^/]+/);
    if (match) return "github.com";
  }
  return undefined;
}

// ── Repository extraction ──────────────────────────────────────────────────────

function extractRepository(obs: SenqorObservation): string | undefined {
  if (!obs.filePath) return undefined;
  // Match github.com/org/repo or gitlab.com/org/repo from a filesystem path
  const match = obs.filePath.match(/((?:github|gitlab)\.com\/[^/]+\/[^/]+)/);
  return match ? `https://${match[1]}` : undefined;
}

// ── Deterministic fingerprint ─────────────────────────────────────────────────
//
// The fingerprint is the stable key used to upsert assets.
// Multiple scanners reporting the same logical crypto usage map to one fingerprint.

export function computeAssetFingerprint(obs: SenqorObservation): string {
  const algo = (obs.algorithm ?? "unknown").toLowerCase().replace(/\s+/g, "-");
  const prim = (obs.primitiveType ?? "unknown").toLowerCase();

  // Network findings: group by host + algorithm
  if (obs.endpoint) {
    const host = obs.endpoint.split(":")[0].toLowerCase();
    const type = (obs.protocol ?? "tls").toLowerCase().includes("ssh") ? "ssh" : "tls";
    return `${type}:${host}:${algo}:${prim}`;
  }

  // Dependency findings: group by package name + algorithm (not version — to merge across updates)
  if (obs.packageName) {
    const pkg = obs.packageName.toLowerCase();
    return `dep:${pkg}:${algo}:${prim}`;
  }

  // Code findings: group by repo path + algorithm (all usages in a repo = one asset)
  if (obs.filePath) {
    // Strip the temp clone directory prefix — normalize to repo-relative
    const repo = extractRepository(obs) ??
      obs.filePath.replace(/\/tmp\/[^/]+\//, "").split("/").slice(0, 3).join("/");
    return `code:${repo.toLowerCase()}:${algo}:${prim}`;
  }

  // Fallback: algorithm + primitive only
  return `generic:${algo}:${prim}`;
}

// ── Asset name ────────────────────────────────────────────────────────────────

function buildAssetName(obs: SenqorObservation): string {
  const algo = obs.algorithm ?? "Unknown Algorithm";
  if (obs.endpoint) return `${algo} on ${obs.endpoint}`;
  if (obs.packageName) return `${obs.packageName}${obs.packageVersion ? ` ${obs.packageVersion}` : ""} (${algo})`;
  if (obs.filePath) {
    const repo = extractRepository(obs);
    if (repo) return `${algo} in ${repo.replace("https://", "")}`;
    const base = obs.filePath.split("/").slice(-2).join("/");
    return `${algo} in ${base}`;
  }
  return algo;
}

// ── Reference generator ───────────────────────────────────────────────────────

let assetRefCounter = 0;
function nextAssetRef(): string {
  assetRefCounter = (assetRefCounter + 1) % 1_000_000;
  const ts = Date.now().toString(36).toUpperCase();
  return `CA-${ts}-${String(assetRefCounter).padStart(5, "0")}`;
}

// ── Upsert CryptoAsset ────────────────────────────────────────────────────────

export interface UpsertResult {
  assetId: string;
  isNew: boolean;
}

export async function upsertCryptoAsset(
  obs: SenqorObservation,
  ctx: ScanContext
): Promise<UpsertResult> {
  const fingerprint = computeAssetFingerprint(obs);
  const assetType   = deriveAssetType(obs);
  const host        = extractHost(obs);
  const repository  = extractRepository(obs);
  const now         = new Date();

  // Find existing asset by fingerprint
  const existing = await db.cryptoAsset.findFirst({
    where: { tenantId: ctx.tenantId, assetFingerprint: fingerprint },
    select: { id: true, sourceCount: true, liveObserved: true },
  });

  if (existing) {
    // Update timestamps, live status, and source tracking
    const isLive = obs.evidenceSource === "ACTIVE_HANDSHAKE" ||
                   obs.evidenceSource === "OBSERVED_LIVE" ||
                   obs.evidenceSource === "RUNTIME_TELEMETRY";

    await db.cryptoAsset.update({
      where: { id: existing.id },
      data: {
        lastObservedAt: now,
        liveObserved:   existing.liveObserved || isLive,
        // Upgrade quantum class if we got a stronger classification
        ...(obs.quantumClass !== "UNKNOWN" ? { quantumClass: obs.quantumClass } : {}),
        // Update confidence fields on the asset record
        ...(obs.keySize    ? { keySize: obs.keySize }         : {}),
        ...(obs.curve      ? { curve: obs.curve }             : {}),
        ...(obs.parameterSet ? { parameterSet: obs.parameterSet } : {}),
        updatedAt: now,
      },
    });

    return { assetId: existing.id, isNew: false };
  }

  // Create new asset
  const isLive = obs.evidenceSource === "ACTIVE_HANDSHAKE" ||
                 obs.evidenceSource === "OBSERVED_LIVE" ||
                 obs.evidenceSource === "RUNTIME_TELEMETRY";

  const asset = await db.cryptoAsset.create({
    data: {
      ref:              nextAssetRef(),
      tenantId:         ctx.tenantId,
      name:             buildAssetName(obs),
      primitiveType:    obs.primitiveType ?? "OTHER",
      purpose:          obs.purpose ?? null,
      provider:         obs.provider ?? null,
      protocol:         obs.protocol ?? null,
      context:          obs.context ?? null,
      quantumClass:     obs.quantumClass,
      liveObserved:     isLive,
      lastObservedAt:   now,
      firstSeenAt:      now,
      evidenceConfidence: obs.confidence,
      sourceCount:      1,
      assetType,
      host:             host ?? null,
      repository:       repository ?? null,
      container:        null,
      keySize:          obs.keySize ?? null,
      curve:            obs.curve ?? null,
      parameterSet:     obs.parameterSet ?? null,
      assetFingerprint: fingerprint,
      migrationStatus:  "NOT_STARTED",
      criticality:      "MEDIUM",
      isActive:         true,
    },
  });

  return { assetId: asset.id, isNew: true };
}

// ── Post-job confidence aggregation ──────────────────────────────────────────
//
// After all observations for a scan job are written, recalculate each affected
// asset's evidenceConfidence from its full set of observations.

export async function refreshAssetConfidence(
  assetIds: string[],
  tenantId: string
): Promise<void> {
  if (assetIds.length === 0) return;

  const assets = await db.cryptoAsset.findMany({
    where: { id: { in: assetIds }, tenantId },
    include: {
      observations: {
        where: { isActive: true },
        select: { evidenceSource: true, confidence: true, sensorType: true },
      },
    },
  });

  for (const asset of assets) {
    const obs = asset.observations;
    if (obs.length === 0) continue;

    // Aggregate confidence: base is the strongest source, +3 per corroborating source
    const sorted = [...obs].sort(
      (a, b) => (SOURCE_RANK[b.evidenceSource] ?? 0) - (SOURCE_RANK[a.evidenceSource] ?? 0)
    );
    const best = sorted[0];
    const corroborating = new Set(obs.map(o => o.sensorType)).size - 1;
    const merged = Math.min(99, (best.confidence ?? 50) + corroborating * 3);

    const distinctSources = new Set(obs.map(o => o.sensorType)).size;

    await db.cryptoAsset.update({
      where: { id: asset.id },
      data: {
        evidenceConfidence: merged,
        sourceCount: distinctSources,
        updatedAt: new Date(),
      },
    });
  }
}
