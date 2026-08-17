/**
 * Strategy Policy — types and vocabulary.
 *
 * The policy layer owns the strategy vocabulary because it is the component
 * that decides which strategies are admissible. The AI stages consume it.
 *
 * Nothing here is AI-driven: a PolicyInput maps to exactly one StrategyPolicy,
 * always, so a remediation decision can be replayed and audited.
 */

export const STRATEGIES = [
  "CODE_CHANGE", "DEPENDENCY_UPGRADE", "CONFIGURATION_CHANGE",
  "CRYPTOGRAPHIC_MIGRATION", "KEY_MIGRATION", "HYBRID_PQC_MIGRATION",
  "REMOVE_UNUSED_CRYPTO", "MANUAL_REVIEW",
] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** Purpose categories, ordered most-security-critical first. */
export const PURPOSE_CATEGORIES = [
  "AUTHENTICATION", "SIGNATURE", "PASSWORD_STORAGE", "KEY_ESTABLISHMENT",
  "CONFIDENTIALITY", "INTEGRITY_SECURITY", "INTEGRITY_NONSECURITY",
  "RANDOMNESS", "UNKNOWN",
] as const;
export type PurposeCategory = (typeof PURPOSE_CATEGORIES)[number];

/**
 * Everything the policy is allowed to reason over. Scanner-derived fields are
 * authoritative evidence; investigator/root-cause fields are AI observations
 * that the engine normalises before use.
 */
export interface PolicyInput {
  // Deterministic scanner evidence
  algorithm: string | null;
  primitiveType: string | null;          // PrimitiveType enum value
  quantumClass: string | null;           // QuantumClass enum value
  evidenceSources: string[];
  affectedDependencies: string[];

  // INVESTIGATOR output
  operation: string | null;
  purposeRaw: string | null;
  dataProtected: string | null;
  isGenuine: boolean | null;
  scope: "LOCAL" | "SYSTEMIC" | null;
  dependents: string[];
  confidence: number | null;

  // ROOT_CAUSE output
  migrationConstraints: string[];
}

export interface PolicyClassification {
  purposeCategory: PurposeCategory;
  quantumSensitive: boolean;
  publicKeyPrimitive: boolean;
  evidenceSufficient: boolean;
  confidenceBand: "INSUFFICIENT" | "SUFFICIENT";
  escalated: boolean;                    // conservative escalation was applied
}

export interface PolicyRationale {
  rule: string;
  effect: "PERMIT" | "PROHIBIT" | "PREFER" | "ESCALATE" | "REQUIRE";
  because: string;
}

export interface StrategyPolicy {
  policyVersion: string;
  inputDigest: string;
  classification: PolicyClassification;
  permittedStrategies: Strategy[];
  prohibitedStrategies: { strategy: Strategy; reason: string }[];
  preferredStrategy: Strategy | null;
  /** Algorithms a remediation must NOT introduce, e.g. Shor-vulnerable primitives. */
  prohibitedTargets: string[];
  requiredProperties: string[];
  confidenceRequirements: string[];
  rationale: PolicyRationale[];
}

/**
 * v1.0.0 boundaries.
 * CONFIDENCE_THRESHOLD is not a universal security constant — it is this
 * version's deterministic boundary, chosen from observed investigator jitter
 * (0.70–0.90) so normal variance cannot flip the band. Change it deliberately
 * and bump POLICY_VERSION.
 */
export const POLICY_VERSION = "1.0.0";
export const CONFIDENCE_THRESHOLD = 0.6;

export const PUBLIC_KEY_PRIMITIVES = new Set([
  "DIGITAL_SIGNATURE", "KEY_ESTABLISHMENT", "PUBLIC_KEY_ENCRYPTION",
]);
