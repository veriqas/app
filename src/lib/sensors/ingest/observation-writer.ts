/**
 * Observation writer — persists normalized SenqorObservations to the DB
 * and upserts CryptoAsset records (the platform's source of truth).
 *
 * Flow per observation:
 *   1. Dedup check (same sensor+algorithm+location in last 24h → skip)
 *   2. Write CryptoObservation row
 *   3. Upsert CryptoAsset via asset-correlator (find-or-create by fingerprint)
 *   4. Link observation to asset via cryptoAssetId
 * After all observations for a job: refreshAssetConfidence() to aggregate
 * multi-source evidence into a merged confidence score on each asset.
 */

import { db } from "@/lib/db/client";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { upsertCryptoAsset, refreshAssetConfidence } from "@/lib/assets/asset-correlator";

// ── Reference generator ────────────────────────────────────────────────────────

let refCounter = 0;
function nextRef(): string {
  refCounter = (refCounter + 1) % 1_000_000;
  const ts = Date.now().toString(36).toUpperCase();
  const seq = String(refCounter).padStart(6, "0");
  return `OBS-${ts}-${seq}`;
}

// ── Write observations ────────────────────────────────────────────────────────

export interface WriteResult {
  written: number;
  skipped: number;
  errors: number;
  assetsCreated: number;
  assetsUpdated: number;
}

export async function writeObservations(
  observations: SenqorObservation[],
  ctx: ScanContext
): Promise<WriteResult> {
  let written = 0, skipped = 0, errors = 0;
  let assetsCreated = 0, assetsUpdated = 0;

  // Track which assets were touched so we can refresh their confidence afterwards
  const touchedAssetIds: string[] = [];

  for (const obs of observations) {
    try {
      // Dedup: skip if an identical observation from the same sensor+algorithm+location
      // already exists within the last 24 hours.
      //
      // lineNumber is part of the location. Without it, every occurrence of an
      // algorithm after the first in a given file is discarded as a duplicate —
      // but each call site is a distinct thing to remediate, so the inventory
      // would under-report and remediation could not fix what it never saw.
      // For network/package findings lineNumber is null, so their dedup
      // behaviour is unchanged.
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await db.cryptoObservation.findFirst({
        where: {
          tenantId:    ctx.tenantId,
          sensorType:  ctx.sensorType,
          algorithm:   obs.algorithm ?? null,
          endpoint:    obs.endpoint    ?? null,
          filePath:    obs.filePath    ?? null,
          lineNumber:  obs.lineNumber  ?? null,
          packageName: obs.packageName ?? null,
          observedAt:  { gte: cutoff },
        },
        select: { id: true, cryptoAssetId: true },
      });

      if (existing) {
        // Still upsert the asset so it stays live even for deduped observations
        if (existing.cryptoAssetId) {
          touchedAssetIds.push(existing.cryptoAssetId);
        }
        skipped++;
        continue;
      }

      // ── 1. Write observation row (without cryptoAssetId yet) ──────────────
      const created = await db.cryptoObservation.create({
        data: {
          ref:           nextRef(),
          tenantId:      ctx.tenantId,
          scanJobId:     ctx.scanJobId ?? null,
          sensorType:    obs.sensorType,
          evidenceSource: obs.evidenceSource,
          observedAt:    obs.observedAt,
          expiresAt:     obs.expiresAt ?? null,
          algorithm:     obs.algorithm     ?? null,
          primitiveType: obs.primitiveType ?? null,
          purpose:       obs.purpose       ?? null,
          keySize:       obs.keySize       ?? null,
          curve:         obs.curve         ?? null,
          parameterSet:  obs.parameterSet  ?? null,
          protocol:      obs.protocol      ?? null,
          endpoint:      obs.endpoint      ?? null,
          port:          obs.port          ?? null,
          filePath:      obs.filePath      ?? null,
          lineNumber:    obs.lineNumber    ?? null,
          packageName:   obs.packageName   ?? null,
          packageVersion: obs.packageVersion ?? null,
          provider:      obs.provider      ?? null,
          context:       obs.context       ?? null,
          confidence:    obs.confidence,
          quantumClass:  obs.quantumClass,
          rawPayload:    obs.rawPayload ? (obs.rawPayload as object) : undefined,
          notes:         obs.notes         ?? null,
        },
      });

      // ── 2. Upsert the CryptoAsset for this observation ────────────────────
      const { assetId, isNew } = await upsertCryptoAsset(obs, ctx);
      if (isNew) assetsCreated++; else assetsUpdated++;
      touchedAssetIds.push(assetId);

      // ── 3. Link observation → asset ───────────────────────────────────────
      await db.cryptoObservation.update({
        where: { id: created.id },
        data:  { cryptoAssetId: assetId },
      });

      written++;
    } catch (e) {
      console.error("[ObservationWriter] failed to write observation:", e);
      errors++;
    }
  }

  // ── 4. Refresh confidence on all touched assets ───────────────────────────
  const uniqueAssetIds = [...new Set(touchedAssetIds)];
  if (uniqueAssetIds.length > 0) {
    await refreshAssetConfidence(uniqueAssetIds, ctx.tenantId).catch(e =>
      console.error("[ObservationWriter] confidence refresh failed:", e)
    );
  }

  return { written, skipped, errors, assetsCreated, assetsUpdated };
}
