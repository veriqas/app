import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupAlgorithm, shorVulnerableAlgorithms, brokenHashAlgorithms } from "../knowledge-base";

test("post-quantum names are not matched to their classical substrings", () => {
  // "ML-DSA-65" contains "DSA"; insertion-order matching resolved it to the
  // quantum-vulnerable DSA entry and handed the planner the opposite guidance.
  assert.equal(lookupAlgorithm("ML-DSA-65")?.algorithm, "ML-DSA");
  assert.equal(lookupAlgorithm("ML-DSA-65")?.classification, "RESILIENT");
  assert.equal(lookupAlgorithm("ML-KEM-768")?.algorithm, "ML-KEM");
  assert.equal(lookupAlgorithm("SLH-DSA-128s")?.algorithm, "SLH-DSA");
});

test("classical primitives still resolve correctly", () => {
  assert.equal(lookupAlgorithm("RSA-2048")?.algorithm, "RSA");
  assert.equal(lookupAlgorithm("ECDSA-P256")?.algorithm, "ECDSA");
  assert.equal(lookupAlgorithm("MD5")?.algorithm, "MD5");
  assert.equal(lookupAlgorithm("SHA-1")?.algorithm, "SHA-1");
});

test("Ed25519 and X25519 are classified as Shor-vulnerable", () => {
  assert.equal(lookupAlgorithm("Ed25519")?.quantumThreat, "SHOR");
  assert.equal(lookupAlgorithm("X25519")?.quantumThreat, "SHOR");
  const shor = shorVulnerableAlgorithms().map(e => e.algorithm);
  for (const a of ["RSA", "ECDSA", "ECDH", "DH", "Ed25519", "X25519", "DSA"]) {
    assert.ok(shor.includes(a), `${a} must be known Shor-vulnerable`);
  }
});

test("post-quantum standards are never listed as Shor-vulnerable", () => {
  const shor = shorVulnerableAlgorithms().map(e => e.algorithm);
  for (const a of ["ML-KEM", "ML-DSA", "SLH-DSA", "FALCON"]) assert.ok(!shor.includes(a));
});

test("broken hashes are enumerable for prohibited-target derivation", () => {
  const broken = brokenHashAlgorithms().map(e => e.algorithm);
  assert.ok(broken.includes("MD5"));
  assert.ok(broken.includes("SHA-1"));
  assert.ok(!broken.includes("SHA-256"));
});

test("aliases resolve", () => {
  assert.equal(lookupAlgorithm("EdDSA")?.algorithm, "Ed25519");
  assert.equal(lookupAlgorithm("kyber768")?.algorithm, "ML-KEM");
  assert.equal(lookupAlgorithm("dilithium3")?.algorithm, "ML-DSA");
});

test("matching is specificity-first, with aliases in the same resolution", () => {
  // The required discrimination: a longer, more specific token always wins over
  // a shorter one it contains, whether that token is a key or an alias.
  assert.equal(lookupAlgorithm("ML-DSA-65")?.algorithm, "ML-DSA", "must not degrade to DSA");
  assert.equal(lookupAlgorithm("EdDSA")?.algorithm, "Ed25519", "alias beats the shorter DSA key");
  assert.equal(lookupAlgorithm("DSA")?.algorithm, "DSA", "plain DSA still resolves to DSA");
  assert.equal(lookupAlgorithm("SHA1withDSA")?.algorithm, "DSA");
  assert.equal(lookupAlgorithm("ML-DSA-65")?.quantumThreat, "NONE");
  assert.equal(lookupAlgorithm("DSA")?.quantumThreat, "SHOR");
});
