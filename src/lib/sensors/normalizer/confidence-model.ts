/**
 * Configurable evidence confidence model.
 * Default weights represent the SENQOR trust hierarchy.
 * Tenants can override per-sensor weights via Sensor.config.
 */

import type { EvidenceSource } from "../types/observation";

export interface ConfidenceConfig {
  /** Base confidence 0–100 for each evidence source */
  baseWeights: Record<EvidenceSource, number>;
  /**
   * Multi-source correlation bonus:
   * each additional corroborating source adds this value (capped at 100)
   */
  correlationBonus: number;
}

export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  baseWeights: {
    OBSERVED_LIVE:        95,
    RUNTIME_TELEMETRY:    90,
    ACTIVE_HANDSHAKE:     85,
    CONFIGURATION:        70,
    STATIC_DETECTION:     60,
    CBOM_IMPORT:          55,
    DEPENDENCY_INFERENCE: 50,
    VENDOR_ATTESTATION:   45,
    MANUAL_EVIDENCE:      40,
  },
  correlationBonus: 3,
};

/**
 * Compute a confidence score for a single observation.
 * sensorConfidence: 0–100 value from the scanner itself (optional).
 * corroboratingCount: how many other sources also saw this finding.
 */
export function computeConfidence(
  source: EvidenceSource,
  sensorConfidence: number | undefined,
  corroboratingCount: number,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): number {
  const base = config.baseWeights[source] ?? 50;

  // Blend base weight with scanner-reported confidence if available
  const blended = sensorConfidence !== undefined
    ? Math.round((base * 0.6) + (sensorConfidence * 0.4))
    : base;

  const bonus = corroboratingCount * config.correlationBonus;
  return Math.min(100, blended + bonus);
}

/**
 * Explain why a confidence score is what it is.
 * Used in the UI "confidence rationale" tooltip.
 */
export function explainConfidence(
  source: EvidenceSource,
  score: number,
  corroboratingCount: number
): string {
  const parts: string[] = [];

  const sourceLabels: Record<EvidenceSource, string> = {
    OBSERVED_LIVE:        "live network observation",
    RUNTIME_TELEMETRY:    "runtime telemetry",
    ACTIVE_HANDSHAKE:     "active protocol handshake",
    CONFIGURATION:        "configuration file analysis",
    STATIC_DETECTION:     "static code analysis",
    CBOM_IMPORT:          "CBOM import",
    DEPENDENCY_INFERENCE: "dependency inference",
    VENDOR_ATTESTATION:   "vendor attestation",
    MANUAL_EVIDENCE:      "manual evidence submission",
  };

  parts.push(`Primary evidence from ${sourceLabels[source] ?? source}.`);
  if (corroboratingCount > 0) {
    parts.push(`Corroborated by ${corroboratingCount} additional source${corroboratingCount > 1 ? "s" : ""}.`);
  }
  if (score >= 90) parts.push("High confidence: multiple authoritative sources agree.");
  else if (score >= 70) parts.push("Moderate confidence: primary evidence is reliable.");
  else if (score >= 50) parts.push("Lower confidence: inferred or static evidence only.");
  else parts.push("Low confidence: unverified or vendor-provided assertion.");

  return parts.join(" ");
}
