import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateStrategyPolicy } from "../strategy-policy";
import { resolvePurpose } from "../purpose-taxonomy";
import type { PolicyInput } from "../policy-types";

const base: PolicyInput = {
  algorithm: null, primitiveType: null, quantumClass: null,
  evidenceSources: ["CRYPTOSCAN_AST"], affectedDependencies: [],
  operation: null, purposeRaw: null, dataProtected: null,
  isGenuine: true, scope: "LOCAL", dependents: [], confidence: 0.9,
  migrationConstraints: [],
};
const mk = (o: Partial<PolicyInput>): PolicyInput => ({ ...base, ...o });

const FIXTURES: { name: string; input: PolicyInput }[] = [
  { name: "RSA signature", input: mk({ algorithm: "RSA-2048", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "JWT signing", operation: "sign", scope: "SYSTEMIC", dependents: ["signAuthToken"] }) },
  { name: "MD5 checksum", input: mk({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "content hashing", confidence: 0.8 }) },
  { name: "MD5 token integrity", input: mk({ algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE", purposeRaw: "session token integrity", scope: "SYSTEMIC", dependents: ["verify_token"], confidence: 0.85 }) },
  { name: "already PQ", input: mk({ algorithm: "ML-KEM-768", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", purposeRaw: "key establishment" }) },
  { name: "insufficient evidence", input: mk({ algorithm: null, primitiveType: null, quantumClass: null }) },
];

test("identical evidence yields byte-identical policy across 100 evaluations", () => {
  for (const { name, input } of FIXTURES) {
    const first = JSON.stringify(evaluateStrategyPolicy(input));
    for (let i = 0; i < 100; i++) {
      assert.equal(JSON.stringify(evaluateStrategyPolicy(input)), first, `${name} drifted on iteration ${i}`);
    }
  }
});

test("inputDigest is stable across 100 evaluations", () => {
  for (const { name, input } of FIXTURES) {
    const d = evaluateStrategyPolicy(input).inputDigest;
    for (let i = 0; i < 100; i++) {
      assert.equal(evaluateStrategyPolicy(input).inputDigest, d, `${name} digest drifted`);
    }
  }
});

test("distinct evidence yields distinct digests", () => {
  const digests = FIXTURES.map(f => evaluateStrategyPolicy(f.input).inputDigest);
  assert.equal(new Set(digests).size, digests.length, "each fixture must be distinguishable");
});

// ── The measured investigator jitter must not move the decision boundary ──
test("observed Python purpose wording variants all resolve to the same policy", () => {
  // Exactly the five purposes the investigator returned for one Python case.
  const observed = [
    "session token integrity/authentication (keyed with pepper)",
    "content hashing (claimed) but actually used as a MAC",
    "content hashing",
    "content hashing (claimed) but actually used as a signature",
    "session token integrity/authentication",
  ];
  const policies = observed.map(purposeRaw => evaluateStrategyPolicy(mk({
    algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE",
    purposeRaw, scope: "SYSTEMIC", dependents: ["verify_token", "token_signature"], confidence: 0.85,
  })));
  const sets = policies.map(p => p.permittedStrategies.join(","));
  assert.equal(new Set(sets).size, 1, `wording jitter changed the permitted set: ${[...new Set(sets)].join(" || ")}`);
  assert.ok(!policies[0].permittedStrategies.includes("CODE_CHANGE"));
});

test("observed confidence jitter (0.70-0.90) does not cross the policy band", () => {
  const confidences = [0.7, 0.75, 0.8, 0.85, 0.9];
  const sets = confidences.map(confidence => evaluateStrategyPolicy(mk({
    algorithm: "MD5", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE",
    purposeRaw: "content hashing", confidence,
  })).permittedStrategies.join(","));
  assert.equal(new Set(sets).size, 1, "confidence jitter must not flip the permitted set");
});

test("purpose taxonomy prefers the security reading when signals conflict", () => {
  const r = resolvePurpose(mk({ purposeRaw: "content hashing", dataProtected: "session authentication token", primitiveType: "HASH" }));
  assert.equal(r.category, "AUTHENTICATION");
});
