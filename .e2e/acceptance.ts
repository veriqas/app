/** Stage 2 acceptance checks that do not need Claude. */
import { evaluateStrategyPolicy } from "@/lib/remediation/policy/strategy-policy";
import { findProhibitedIntroductions } from "@/lib/remediation/policy/patch-policy-check";
import type { PolicyInput } from "@/lib/remediation/policy/policy-types";

const base: PolicyInput = {
  algorithm: null, primitiveType: null, quantumClass: null, evidenceSources: [], affectedDependencies: [],
  operation: null, purposeRaw: null, dataProtected: null, isGenuine: true, scope: "LOCAL",
  dependents: [], confidence: 0.9, migrationConstraints: [],
};
const P = (o: Partial<PolicyInput>) => evaluateStrategyPolicy({ ...base, ...o });
const ok = (b: boolean, s: string) => console.log(`${b ? "PASS" : "FAIL"}  ${s}`);

// 1. Determinism
const fixture = { algorithm: "RSA-2048", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "JWT signing", operation: "sign" };
const first = JSON.stringify(P(fixture));
let stable = true, digestStable = true;
const d0 = P(fixture).inputDigest;
for (let i = 0; i < 100; i++) {
  if (JSON.stringify(P(fixture)) !== first) stable = false;
  if (P(fixture).inputDigest !== d0) digestStable = false;
}
ok(stable, "identical evidence x100 -> byte-identical policy");
ok(digestStable, "identical evidence x100 -> identical inputDigest");

// 2. RSA protection
const rsa = P(fixture);
ok(rsa.prohibitedTargets.some(t => /^ed25519$/i.test(t)), "RSA signature -> Ed25519 prohibited as a target");
ok(!rsa.permittedStrategies.includes("CODE_CHANGE"), "RSA signature -> CODE_CHANGE prohibited");
ok(rsa.permittedStrategies.includes("HYBRID_PQC_MIGRATION") && rsa.permittedStrategies.includes("MANUAL_REVIEW"),
   "RSA signature -> PQC/hybrid or MANUAL_REVIEW permitted");

// 3. Ed25519 regression
const ed = P({ algorithm: "Ed25519", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "signature" });
ok(ed.classification.quantumSensitive, "Ed25519 signature recognised as quantum-vulnerable");
ok(!ed.permittedStrategies.includes("CODE_CHANGE"), "Ed25519 not treated as already-PQ");

// 4. Ambiguous evidence
ok(JSON.stringify(P({ algorithm: null, primitiveType: null, quantumClass: null }).permittedStrategies) === '["MANUAL_REVIEW"]', "unknown algorithm -> MANUAL_REVIEW only");
ok(JSON.stringify(P({ ...fixture, confidence: 0.4 }).permittedStrategies) === '["MANUAL_REVIEW"]', "low confidence -> MANUAL_REVIEW only");
ok(JSON.stringify(P({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: null }).permittedStrategies) === '["MANUAL_REVIEW"]', "unknown purpose -> MANUAL_REVIEW only");

// 5. Already post-quantum
ok(JSON.stringify(P({ algorithm: "ML-KEM-768", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", purposeRaw: "key establishment" }).permittedStrategies) === '["MANUAL_REVIEW"]',
   "already post-quantum -> MANUAL_REVIEW only (agent cannot contradict scanner evidence)");

// 6. Patch-content enforcement
const edViolation = findProhibitedIntroductions(
  [{ filePath: "src/auth/jwt.ts", originalContent: "const o = { algorithm: 'RS256' };", newContent: "import { ed25519 } from '@noble/curves/ed25519';\nexport const s = (m) => ed25519.sign(m, k);" }],
  rsa.prohibitedTargets);
ok(edViolation.length > 0, "HYBRID_PQC_MIGRATION with an Ed25519 patch -> rejected on content");
const pqOk = findProhibitedIntroductions(
  [{ filePath: "src/auth/jwt.ts", originalContent: "const o = { algorithm: 'RS256' };", newContent: "import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';\nexport const s = (m) => ml_dsa65.sign(k, m);" }],
  rsa.prohibitedTargets);
ok(pqOk.length === 0, "genuine ML-DSA patch -> accepted");
