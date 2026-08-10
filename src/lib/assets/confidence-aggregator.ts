/**
 * Evidence source ranking for confidence aggregation.
 * Shared between the correlator and asset-correlator to ensure consistent ordering.
 */
export const SOURCE_RANK: Record<string, number> = {
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
