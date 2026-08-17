import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateStrategyPolicy, computeInputDigest } from "../strategy-policy";
import { POLICY_VERSION } from "../policy-types";
import type { PolicyInput } from "../policy-types";

const base: PolicyInput = {
  algorithm: null, primitiveType: null, quantumClass: null,
  evidenceSources: ["CRYPTOSCAN_AST"], affectedDependencies: [],
  operation: null, purposeRaw: null, dataProtected: null,
  isGenuine: true, scope: "LOCAL", dependents: [], confidence: 0.9,
  migrationConstraints: [],
};
const mk = (o: Partial<PolicyInput>): PolicyInput => ({ ...base, ...o });
const P = (o: Partial<PolicyInput>) => evaluateStrategyPolicy(mk(o));
const targets = (p: ReturnType<typeof P>) => p.prohibitedTargets.map(t => t.toLowerCase());

// ── 1-3. Quantum-vulnerable public key ──
test("RSA signature: PQC/hybrid permitted, CODE_CHANGE prohibited, Ed25519 a prohibited target", () => {
  const p = P({ algorithm: "RSA-2048", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "JWT signing", operation: "sign" });
  assert.ok(p.permittedStrategies.includes("HYBRID_PQC_MIGRATION"));
  assert.ok(p.permittedStrategies.includes("CRYPTOGRAPHIC_MIGRATION"));
  assert.ok(!p.permittedStrategies.includes("CODE_CHANGE"), "a code change cannot resolve quantum exposure");
  assert.ok(targets(p).includes("ed25519"), "Ed25519 must be prohibited as a replacement");
  assert.ok(targets(p).includes("ecdsa"));
  assert.ok(targets(p).includes("x25519"));
  assert.ok(p.requiredProperties.some(r => /FIPS 203\/204\/205|hybrid/i.test(r)));
});

test("RSA key establishment is treated the same way", () => {
  const p = P({ algorithm: "RSA-2048", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "key exchange" });
  assert.ok(p.permittedStrategies.includes("HYBRID_PQC_MIGRATION"));
  assert.ok(!p.permittedStrategies.includes("CODE_CHANGE"));
});

test("ECDSA signature is quantum-vulnerable", () => {
  const p = P({ algorithm: "ECDSA-P256", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "signature" });
  assert.ok(p.classification.quantumSensitive);
  assert.ok(!p.permittedStrategies.includes("CODE_CHANGE"));
});

// ── 4. Ed25519 must not be treated as already-safe ──
test("Ed25519 signature is recognised as quantum-vulnerable, not already-PQ", () => {
  const p = P({ algorithm: "Ed25519", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "signature" });
  assert.equal(p.classification.quantumSensitive, true);
  assert.ok(p.permittedStrategies.includes("HYBRID_PQC_MIGRATION"));
  assert.ok(targets(p).includes("ed25519"), "cannot be remediated with itself");
});

// ── 5. Password storage ──
test("MD5 password hashing requires a purpose-built password hash", () => {
  const p = P({ algorithm: "MD5", primitiveType: "PASSWORD_HASHING", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "password storage" });
  assert.ok(p.permittedStrategies.includes("CRYPTOGRAPHIC_MIGRATION"));
  assert.ok(p.requiredProperties.some(r => /Argon2|memory-hard/i.test(r)));
  assert.ok(targets(p).includes("sha-256"), "a plain hash is not acceptable for passwords");
  assert.ok(!p.permittedStrategies.includes("HYBRID_PQC_MIGRATION"));
});

// ── 6-7. The measured MD5 cases ──
test("MD5 content checksum, LOCAL, no dependents: CODE_CHANGE permitted and preferred", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing", scope: "LOCAL", dependents: [], confidence: 0.8 });
  assert.ok(p.permittedStrategies.includes("CODE_CHANGE"));
  assert.equal(p.preferredStrategy, "CODE_CHANGE");
  assert.equal(p.classification.purposeCategory, "INTEGRITY_NONSECURITY");
  assert.ok(!p.permittedStrategies.includes("HYBRID_PQC_MIGRATION"), "classical weakness, not quantum exposure");
});

test("MD5 token integrity, SYSTEMIC with dependents: CODE_CHANGE prohibited", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "session token integrity/authentication", scope: "SYSTEMIC", dependents: ["verify_token", "token_signature"], confidence: 0.85 });
  assert.ok(!p.permittedStrategies.includes("CODE_CHANGE"), "systemic reach needs a migration, not a single-site edit");
  assert.ok(p.permittedStrategies.includes("CRYPTOGRAPHIC_MIGRATION"));
  assert.equal(p.classification.purposeCategory, "AUTHENTICATION");
});

// ── 8-9. Other hashes ──
test("SHA-1 signature: migration required, broken hashes prohibited as targets", () => {
  const p = P({ algorithm: "SHA-1", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "signature digest", scope: "LOCAL" });
  assert.ok(targets(p).includes("md5"));
  assert.ok(targets(p).includes("sha1") || targets(p).includes("sha-1"));
});

test("SHA-256 ordinary hash: no PQC migration, proportionate options only", () => {
  const p = P({ algorithm: "SHA-256", primitiveType: "HASH", quantumClass: "QUANTUM_REDUCED_SECURITY", purposeRaw: "content hashing" });
  assert.ok(!p.permittedStrategies.includes("HYBRID_PQC_MIGRATION"));
  assert.ok(p.permittedStrategies.includes("CODE_CHANGE"));
});

// ── 10. Already post-quantum ──
test("ML-KEM / ML-DSA: MANUAL_REVIEW only; the agent may not contradict scanner evidence", () => {
  for (const algo of ["ML-KEM-768", "ML-DSA-65"]) {
    const p = P({ algorithm: algo, primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", purposeRaw: "key establishment" });
    assert.deepEqual(p.permittedStrategies, ["MANUAL_REVIEW"], `${algo} must not be auto-migrated`);
    assert.ok(p.prohibitedStrategies.some(x => x.strategy === "CRYPTOGRAPHIC_MIGRATION"));
  }
});

// ── 11-13. Insufficient evidence → MANUAL_REVIEW ──
test("unknown algorithm falls back to MANUAL_REVIEW", () => {
  const p = P({ algorithm: null, primitiveType: "HASH", quantumClass: "UNKNOWN", purposeRaw: "unclear" });
  assert.deepEqual(p.permittedStrategies, ["MANUAL_REVIEW"]);
  assert.equal(p.classification.evidenceSufficient, false);
});

test("low confidence falls back to MANUAL_REVIEW", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing", confidence: 0.4 });
  assert.deepEqual(p.permittedStrategies, ["MANUAL_REVIEW"]);
  assert.equal(p.classification.confidenceBand, "INSUFFICIENT");
});

test("missing purpose falls back to MANUAL_REVIEW", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: null, dataProtected: null, operation: null });
  assert.deepEqual(p.permittedStrategies, ["MANUAL_REVIEW"]);
});

// ── 14. Not genuine ──
test("non-genuine crypto permits removal", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing", isGenuine: false });
  assert.ok(p.permittedStrategies.includes("REMOVE_UNUSED_CRYPTO"));
  assert.equal(p.preferredStrategy, "REMOVE_UNUSED_CRYPTO");
});

// ── 15. Conservative escalation ──
test("ambiguous purpose with systemic scope and dependents escalates to security-critical", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing", scope: "SYSTEMIC", dependents: ["verify_token"], confidence: 0.85 });
  assert.equal(p.classification.escalated, true);
  assert.equal(p.classification.purposeCategory, "INTEGRITY_SECURITY");
  assert.ok(!p.permittedStrategies.includes("CODE_CHANGE"));
});

// ── Invariants ──
test("MANUAL_REVIEW is always available as a human escape hatch", () => {
  const cases: Partial<PolicyInput>[] = [
    { algorithm: "RSA-2048", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "signature" },
    { algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "checksum" },
    { algorithm: "ML-KEM-768", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", purposeRaw: "kem" },
    { algorithm: null, primitiveType: null, quantumClass: null },
  ];
  for (const c of cases) assert.ok(P(c).permittedStrategies.includes("MANUAL_REVIEW"));
});

test("dependency-sourced weakness permits a dependency upgrade", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing", affectedDependencies: ["left-pad@1.0.0"] });
  assert.ok(p.permittedStrategies.includes("DEPENDENCY_UPGRADE"));
});

test("interoperability constraints prohibit a bare code change", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing", migrationConstraints: ["must remain interoperable with external partners"] });
  assert.ok(!p.permittedStrategies.includes("CODE_CHANGE"));
});

test("policy is versioned and carries an input digest", () => {
  const p = P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing" });
  assert.equal(p.policyVersion, POLICY_VERSION);
  assert.match(p.inputDigest, /^[0-9a-f]{32}$/);
  assert.ok(p.rationale.length > 0, "every decision is explained");
});

test("digest ignores incidental ordering but tracks real evidence changes", () => {
  const a = mk({ algorithm: "RSA", primitiveType: "DIGITAL_SIGNATURE", dependents: ["b", "a"], migrationConstraints: ["y", "x"] });
  const b = mk({ algorithm: "RSA", primitiveType: "DIGITAL_SIGNATURE", dependents: ["a", "b"], migrationConstraints: ["x", "y"] });
  assert.equal(computeInputDigest(a), computeInputDigest(b));
  const c = mk({ algorithm: "RSA", primitiveType: "DIGITAL_SIGNATURE", dependents: ["a", "b", "c"] });
  assert.notEqual(computeInputDigest(a), computeInputDigest(c));
});
