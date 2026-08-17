/**
 * Deterministic Strategy Policy Engine.
 *
 * Sits between root-cause analysis and the AI planner. Given the evidence the
 * system has already established, it computes which remediation strategies are
 * ADMISSIBLE. It contains no AI, performs no I/O, and returns the same result
 * for the same input every time.
 *
 * It defines SECURITY BOUNDARIES, not implementations. There is deliberately no
 * "MD5 -> SHA-256" mapping anywhere: rules key on threat class, primitive family,
 * purpose category, scope and dependents, and prohibited targets are DERIVED from
 * the knowledge base. Adding an algorithm to the knowledge base therefore changes
 * behaviour with no rule edits — the test of a policy engine rather than a lookup
 * table.
 *
 * The policy governs what the AI may ATTEMPT. Whether the result is actually
 * safe remains the verifier's decision, on scanner evidence.
 */
import { createHash } from "crypto";
import {
  POLICY_VERSION, CONFIDENCE_THRESHOLD, PUBLIC_KEY_PRIMITIVES,
  type PolicyInput, type StrategyPolicy, type Strategy, type PolicyRationale,
} from "./policy-types";
import { resolvePurpose } from "./purpose-taxonomy";
import { lookupAlgorithm, shorVulnerableAlgorithms, brokenHashAlgorithms } from "../agent/knowledge-base";

/** Stable digest of the normalised input — proves two runs saw the same evidence. */
export function computeInputDigest(input: PolicyInput): string {
  const normalised = {
    algorithm: (input.algorithm ?? "").toUpperCase(),
    primitiveType: input.primitiveType ?? null,
    quantumClass: input.quantumClass ?? null,
    operation: (input.operation ?? "").toLowerCase(),
    purposeRaw: (input.purposeRaw ?? "").toLowerCase(),
    dataProtected: (input.dataProtected ?? "").toLowerCase(),
    isGenuine: input.isGenuine,
    scope: input.scope,
    dependents: [...input.dependents].map(d => d.toLowerCase()).sort(),
    confidence: input.confidence,
    migrationConstraints: [...input.migrationConstraints].map(c => c.toLowerCase()).sort(),
    evidenceSources: [...input.evidenceSources].sort(),
    affectedDependencies: [...input.affectedDependencies].sort(),
  };
  return createHash("sha256").update(JSON.stringify(normalised)).digest("hex").slice(0, 32);
}

/** Prohibited-target matcher tokens for a set of knowledge-base entries. */
function targetsFrom(entries: ReturnType<typeof shorVulnerableAlgorithms>): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    out.add(e.algorithm);
    for (const a of e.aliases ?? []) out.add(a);
  }
  return [...out].sort();
}

const CONSTRAINT_ESCALATORS = [
  "interop", "external", "third-party", "third party", "stored", "backwards",
  "backward-compat", "compatibility", "legacy", "downstream", "client",
];

export function evaluateStrategyPolicy(input: PolicyInput): StrategyPolicy {
  const rationale: PolicyRationale[] = [];
  const permitted = new Set<Strategy>(["MANUAL_REVIEW"]); // never removed
  const prohibited = new Map<Strategy, string>();
  const prohibitedTargets = new Set<string>();
  const requiredProperties: string[] = [];
  const confidenceRequirements: string[] = [];
  let preferred: Strategy | null = null;

  const permit = (s: Strategy, rule: string, because: string) => {
    permitted.add(s); prohibited.delete(s);
    rationale.push({ rule, effect: "PERMIT", because });
  };
  const prohibit = (s: Strategy, rule: string, because: string) => {
    permitted.delete(s);
    if (!prohibited.has(s)) { prohibited.set(s, because); rationale.push({ rule, effect: "PROHIBIT", because }); }
  };
  const require_ = (rule: string, because: string) => {
    requiredProperties.push(because); rationale.push({ rule, effect: "REQUIRE", because });
  };

  const kb = lookupAlgorithm(input.algorithm);
  const purpose = resolvePurpose(input);
  const primitive = String(input.primitiveType ?? "");
  const publicKeyPrimitive = PUBLIC_KEY_PRIMITIVES.has(primitive);
  const quantumClass = String(input.quantumClass ?? "");
  const quantumSensitive = quantumClass === "QUANTUM_VULNERABLE" && publicKeyPrimitive;
  const confidence = input.confidence ?? 0;
  const confidenceBand = confidence >= CONFIDENCE_THRESHOLD ? "SUFFICIENT" : "INSUFFICIENT";

  if (purpose.escalated) {
    rationale.push({
      rule: "PURPOSE_ESCALATION", effect: "ESCALATE",
      because: `Purpose wording was non-specific, but the primitive is ${primitive} with systemic scope and ${input.dependents.length} dependent(s); treated as security-critical integrity.`,
    });
  }

  // ── R0 EVIDENCE_SUFFICIENCY ───────────────────────────────────────────────
  const missing: string[] = [];
  if (!input.algorithm) missing.push("algorithm");
  if (!input.primitiveType) missing.push("primitiveType");
  if (input.isGenuine === null || input.isGenuine === undefined) missing.push("isGenuine");
  if (purpose.category === "UNKNOWN") missing.push("purpose");
  if (confidenceBand === "INSUFFICIENT") missing.push(`confidence>=${CONFIDENCE_THRESHOLD}`);

  confidenceRequirements.push(`Investigator confidence must be >= ${CONFIDENCE_THRESHOLD} for any automated strategy (policy ${POLICY_VERSION}).`);

  if (missing.length > 0) {
    rationale.push({
      rule: "R0_EVIDENCE_SUFFICIENCY", effect: "PROHIBIT",
      because: `Insufficient evidence to authorise an automated change (missing/weak: ${missing.join(", ")}). Human review is the only safe outcome.`,
    });
    return finalise({
      input, rationale, permitted: new Set<Strategy>(["MANUAL_REVIEW"]),
      prohibited: new Map(), prohibitedTargets: new Set(), requiredProperties,
      confidenceRequirements, preferred: "MANUAL_REVIEW",
      classification: {
        purposeCategory: purpose.category, quantumSensitive, publicKeyPrimitive,
        evidenceSufficient: false, confidenceBand, escalated: purpose.escalated,
      },
    });
  }

  // ── R1 NOT_GENUINE ────────────────────────────────────────────────────────
  if (input.isGenuine === false) {
    permit("REMOVE_UNUSED_CRYPTO", "R1_NOT_GENUINE", "The investigation found this is not a genuine cryptographic use, so removal is preferable to migration.");
    preferred = "REMOVE_UNUSED_CRYPTO";
    return finalise({
      input, rationale, permitted, prohibited, prohibitedTargets, requiredProperties,
      confidenceRequirements, preferred,
      classification: { purposeCategory: purpose.category, quantumSensitive, publicKeyPrimitive, evidenceSufficient: true, confidenceBand, escalated: purpose.escalated },
    });
  }

  // ── R7 ALREADY_POST_QUANTUM (checked early: nothing to remediate) ─────────
  if (quantumClass === "POST_QUANTUM" || quantumClass === "QUANTUM_RESILIENT") {
    for (const s of ["CODE_CHANGE", "CRYPTOGRAPHIC_MIGRATION", "HYBRID_PQC_MIGRATION", "KEY_MIGRATION", "DEPENDENCY_UPGRADE", "CONFIGURATION_CHANGE", "REMOVE_UNUSED_CRYPTO"] as Strategy[]) {
      prohibit(s, "R7_ALREADY_POST_QUANTUM", "Scanner evidence classifies this as post-quantum; the agent may not contradict that evidence by migrating it. If the classification is wrong, that is a human-review matter.");
    }
    return finalise({
      input, rationale, permitted, prohibited, prohibitedTargets, requiredProperties,
      confidenceRequirements, preferred: "MANUAL_REVIEW",
      classification: { purposeCategory: purpose.category, quantumSensitive, publicKeyPrimitive, evidenceSufficient: true, confidenceBand, escalated: purpose.escalated },
    });
  }

  // ── R2 QUANTUM_PUBLIC_KEY (the critical rule) ─────────────────────────────
  if (quantumSensitive) {
    permit("HYBRID_PQC_MIGRATION", "R2_QUANTUM_PUBLIC_KEY", "A Shor-vulnerable public-key primitive requires a post-quantum or explicit hybrid replacement.");
    permit("CRYPTOGRAPHIC_MIGRATION", "R2_QUANTUM_PUBLIC_KEY", "Full migration to a NIST post-quantum primitive is admissible.");
    permit("KEY_MIGRATION", "R2_QUANTUM_PUBLIC_KEY", "Key material migration is admissible as part of a post-quantum transition.");
    prohibit("CODE_CHANGE", "R2_QUANTUM_PUBLIC_KEY", "Quantum exposure of a public-key primitive cannot be resolved by a local code change; it requires a cryptographic migration.");
    for (const t of targetsFrom(shorVulnerableAlgorithms())) prohibitedTargets.add(t);
    require_("R2_QUANTUM_PUBLIC_KEY", "The replacement primitive must be NIST post-quantum (FIPS 203/204/205) or an explicit classical+PQC hybrid. Substituting another Shor-vulnerable primitive is not a remediation.");
    preferred = input.migrationConstraints.length > 0 || input.scope === "SYSTEMIC"
      ? "HYBRID_PQC_MIGRATION" : "CRYPTOGRAPHIC_MIGRATION";
  }

  // ── R3/R4 classically-broken hash or MAC ──────────────────────────────────
  const classicallyBroken = kb?.quantumThreat === "NONE" && kb?.classification === "VULNERABLE";
  if (classicallyBroken && (primitive === "HASH" || primitive === "MAC")) {
    const securityCritical = ["AUTHENTICATION", "SIGNATURE", "INTEGRITY_SECURITY", "PASSWORD_STORAGE"].includes(purpose.category);
    for (const t of targetsFrom(brokenHashAlgorithms())) prohibitedTargets.add(t);
    require_("R3_WEAK_HASH", "The replacement must be a hash with intact collision resistance (for example SHA-256 or SHA-3); another classically-broken hash is not a remediation.");
    prohibit("HYBRID_PQC_MIGRATION", "R3_WEAK_HASH", "This is a classical weakness, not quantum exposure; a post-quantum migration would be disproportionate.");
    if (securityCritical) {
      permit("CRYPTOGRAPHIC_MIGRATION", "R3_WEAK_HASH_SECURITY", `The hash is load-bearing for ${purpose.category.toLowerCase().replace("_", " ")}, so the primitive itself must change.`);
      permit("CODE_CHANGE", "R3_WEAK_HASH_SECURITY", "A contained code change is admissible where the replacement is local.");
      preferred = preferred ?? "CRYPTOGRAPHIC_MIGRATION";
    } else {
      permit("CODE_CHANGE", "R4_WEAK_HASH_NONSECURITY", "The hash is used for non-adversarial integrity, so a direct local substitution is proportionate.");
      permit("CRYPTOGRAPHIC_MIGRATION", "R4_WEAK_HASH_NONSECURITY", "A fuller migration remains admissible if the implementer judges it warranted.");
      preferred = preferred ?? "CODE_CHANGE";
    }
  }

  // ── R5 PASSWORD_STORAGE ───────────────────────────────────────────────────
  if (primitive === "PASSWORD_HASHING" || purpose.category === "PASSWORD_STORAGE") {
    permit("CRYPTOGRAPHIC_MIGRATION", "R5_PASSWORD_STORAGE", "Password storage must use a purpose-built password hash.");
    permit("CODE_CHANGE", "R5_PASSWORD_STORAGE", "A contained change to the password-hashing call is admissible.");
    for (const t of targetsFrom(brokenHashAlgorithms())) prohibitedTargets.add(t);
    prohibitedTargets.add("sha-256"); prohibitedTargets.add("sha256"); prohibitedTargets.add("sha-512");
    require_("R5_PASSWORD_STORAGE", "The replacement must be a memory-hard or purpose-built password hash (Argon2id, scrypt, bcrypt, or PBKDF2 with adequate parameters). A plain cryptographic hash is not acceptable for password storage.");
    prohibit("HYBRID_PQC_MIGRATION", "R5_PASSWORD_STORAGE", "Password hashing carries no public-key quantum exposure.");
    preferred = preferred ?? "CRYPTOGRAPHIC_MIGRATION";
  }

  // ── R6 SYMMETRIC / GROVER-WEAKENED ────────────────────────────────────────
  if (quantumClass === "QUANTUM_REDUCED_SECURITY" && !publicKeyPrimitive) {
    permit("CODE_CHANGE", "R6_SYMMETRIC_WEAKENED", "Grover only halves symmetric strength; a parameter or primitive adjustment is proportionate.");
    permit("CONFIGURATION_CHANGE", "R6_SYMMETRIC_WEAKENED", "Adjusting configured parameters is admissible.");
    prohibit("HYBRID_PQC_MIGRATION", "R6_SYMMETRIC_WEAKENED", "Hybrid PQC applies to public-key primitives, not symmetric ones.");
  }

  // ── R8 HYBRID_IN_PROGRESS ─────────────────────────────────────────────────
  if (quantumClass === "HYBRID") {
    permit("CRYPTOGRAPHIC_MIGRATION", "R8_HYBRID_IN_PROGRESS", "A hybrid deployment may be completed by retiring the classical half once dependents allow.");
    for (const t of targetsFrom(shorVulnerableAlgorithms())) prohibitedTargets.add(t);
  }

  // ── R9 DEPENDENCY_SOURCED ─────────────────────────────────────────────────
  if (input.affectedDependencies.length > 0) {
    permit("DEPENDENCY_UPGRADE", "R9_DEPENDENCY_SOURCED", `The weakness reaches the codebase through ${input.affectedDependencies.length} dependency/dependencies, so upgrading them is admissible.`);
  }

  // ── R10 SYSTEMIC_SCOPE_GATE ───────────────────────────────────────────────
  if (input.scope === "SYSTEMIC" && input.dependents.length > 0) {
    prohibit("CODE_CHANGE", "R10_SYSTEMIC_SCOPE_GATE", `The primitive has ${input.dependents.length} dependent(s) and systemic scope; a single-site code change cannot be a complete remediation.`);
  }

  // ── R11 CONSTRAINT_ESCALATION ─────────────────────────────────────────────
  const constraintText = input.migrationConstraints.join(" ").toLowerCase();
  if (CONSTRAINT_ESCALATORS.some(t => constraintText.includes(t))) {
    prohibit("CODE_CHANGE", "R11_CONSTRAINT_ESCALATION", "Declared migration constraints (interoperability, stored data or backwards compatibility) mean a bare code change cannot satisfy the transition safely.");
    if (permitted.has("HYBRID_PQC_MIGRATION")) preferred = "HYBRID_PQC_MIGRATION";
  }

  // No admissible automated strategy survived the rules.
  if (permitted.size === 1) preferred = "MANUAL_REVIEW";

  return finalise({
    input, rationale, permitted, prohibited, prohibitedTargets, requiredProperties,
    confidenceRequirements, preferred,
    classification: {
      purposeCategory: purpose.category, quantumSensitive, publicKeyPrimitive,
      evidenceSufficient: true, confidenceBand, escalated: purpose.escalated,
    },
  });
}

function finalise(a: {
  input: PolicyInput;
  rationale: PolicyRationale[];
  permitted: Set<Strategy>;
  prohibited: Map<Strategy, string>;
  prohibitedTargets: Set<string>;
  requiredProperties: string[];
  confidenceRequirements: string[];
  preferred: Strategy | null;
  classification: StrategyPolicy["classification"];
}): StrategyPolicy {
  const permittedStrategies = [...a.permitted].sort();
  const preferred = a.preferred && permittedStrategies.includes(a.preferred) ? a.preferred : null;
  return {
    policyVersion: POLICY_VERSION,
    inputDigest: computeInputDigest(a.input),
    classification: a.classification,
    permittedStrategies,
    prohibitedStrategies: [...a.prohibited.entries()].map(([strategy, reason]) => ({ strategy, reason })).sort((x, y) => x.strategy.localeCompare(y.strategy)),
    preferredStrategy: preferred ?? (permittedStrategies.length === 1 ? permittedStrategies[0] : null),
    prohibitedTargets: [...a.prohibitedTargets].sort(),
    requiredProperties: [...a.requiredProperties],
    confidenceRequirements: [...a.confidenceRequirements],
    rationale: a.rationale,
  };
}
