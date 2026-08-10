/**
 * Multi-sensor observation correlator.
 * Groups observations that refer to the same cryptographic asset
 * and boosts confidence when multiple sources agree.
 */

import type { SenqorObservation } from "../types/observation";
import { computeConfidence, explainConfidence } from "./confidence-model";

export interface CorrelationGroup {
  /** Canonical algorithm name shared by this group */
  algorithm: string;
  primitiveType?: string;
  endpoint?: string;
  filePath?: string;
  packageName?: string;

  /** All observations in this group, ordered strongest source first */
  observations: SenqorObservation[];

  /** Merged, boosted confidence for the group */
  mergedConfidence: number;

  /** Human-readable explanation */
  confidenceRationale: string;

  /** Best quantum classification (strongest evidence wins) */
  quantumClass: import("../types/observation").QuantumClass;
}

// ── Evidence source ranking (highest = most authoritative) ────────────────────

const SOURCE_RANK: Record<string, number> = {
  OBSERVED_LIVE:        9,
  RUNTIME_TELEMETRY:    8,
  ACTIVE_HANDSHAKE:     7,
  CONFIGURATION:        5,
  STATIC_DETECTION:     4,
  CBOM_IMPORT:          3,
  DEPENDENCY_INFERENCE: 2,
  VENDOR_ATTESTATION:   1,
  MANUAL_EVIDENCE:      0,
};

// ── Correlation key ────────────────────────────────────────────────────────────

function correlationKey(obs: SenqorObservation): string {
  // Group by algorithm + primary location context
  const algo = obs.algorithm?.toLowerCase() ?? "unknown";
  if (obs.endpoint) return `net:${obs.endpoint}:${algo}`;
  if (obs.filePath) return `file:${obs.filePath}:${obs.lineNumber ?? 0}:${algo}`;
  if (obs.packageName) return `dep:${obs.packageName}:${obs.packageVersion ?? ""}:${algo}`;
  return `algo:${algo}`;
}

// ── Correlate ─────────────────────────────────────────────────────────────────

export function correlate(observations: SenqorObservation[]): CorrelationGroup[] {
  const groups = new Map<string, SenqorObservation[]>();

  for (const obs of observations) {
    const key = correlationKey(obs);
    const group = groups.get(key) ?? [];
    group.push(obs);
    groups.set(key, group);
  }

  const result: CorrelationGroup[] = [];

  for (const [, members] of groups) {
    // Sort: strongest source first
    const sorted = [...members].sort((a, b) =>
      (SOURCE_RANK[b.evidenceSource] ?? 0) - (SOURCE_RANK[a.evidenceSource] ?? 0)
    );

    const best = sorted[0];
    const corroborating = sorted.length - 1;

    // Boost confidence for each corroborating source
    const mergedConfidence = computeConfidence(
      best.evidenceSource,
      best.confidence,
      corroborating
    );

    // Best quantum class = highest-rank observation's class
    // (OBSERVED_LIVE always wins over STATIC_DETECTION)
    const quantumClass = best.quantumClass;

    result.push({
      algorithm: best.algorithm ?? "UNKNOWN",
      primitiveType: best.primitiveType,
      endpoint: best.endpoint,
      filePath: best.filePath,
      packageName: best.packageName,
      observations: sorted,
      mergedConfidence,
      confidenceRationale: explainConfidence(best.evidenceSource, mergedConfidence, corroborating),
      quantumClass,
    });
  }

  // Return groups ordered by confidence descending
  return result.sort((a, b) => b.mergedConfidence - a.mergedConfidence);
}

/**
 * Produce a human-readable evidence summary for a correlation group.
 * Used in the CryptoAsset evidence panel.
 */
export function formatEvidenceSummary(group: CorrelationGroup): string {
  const lines = group.observations.map(o => {
    const when = o.observedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
    const source = o.evidenceSource.replace(/_/g, " ");
    const location = o.filePath
      ? `${o.filePath}${o.lineNumber ? `:${o.lineNumber}` : ""}`
      : o.endpoint ?? o.packageName ?? "";
    return `${o.sensorType} (${source}) — ${location} — ${when}`;
  });
  return lines.join("\n");
}
