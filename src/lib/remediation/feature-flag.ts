// Remediation engine version selector.
//
// V1 = the existing, production per-observation RemediationJob flow. This is
//      the SAFE DEFAULT. A client upgrading VERIQAS must never accidentally
//      activate the experimental V2 correlation engine.
// V2 = the new correlation / case-based engine (additive, opt-in).
//
// Controlled by the REMEDIATION_ENGINE environment variable. Any value other
// than the exact string "v2" (including missing/empty) resolves to V1.

export type RemediationEngine = "v1" | "v2";

export function getRemediationEngine(): RemediationEngine {
  return process.env.REMEDIATION_ENGINE?.trim().toLowerCase() === "v2" ? "v2" : "v1";
}

/** True only when the operator has explicitly opted into the V2 engine. */
export function isV2Enabled(): boolean {
  return getRemediationEngine() === "v2";
}
