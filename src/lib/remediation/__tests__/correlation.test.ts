// Unit tests for conservative finding correlation.
// Run: npx tsx --test src/lib/remediation/__tests__/correlation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { correlateObservations, correlationKeyFor, type CorrelatableObservation } from "../correlation";

// Respect explicit null (do NOT fall back to a default when a field is
// deliberately set to null) — only default when the key is absent.
function pick<T>(p: Record<string, unknown>, key: string, dflt: T): T {
  return key in p ? (p[key] as T) : dflt;
}
function obs(p: Partial<CorrelatableObservation>): CorrelatableObservation {
  const r = p as Record<string, unknown>;
  return {
    id: pick(r, "id", Math.random().toString(36).slice(2)),
    sensorType: pick(r, "sensorType", "CRYPTOSCAN"),
    repoUrl: pick(r, "repoUrl", "https://github.com/acme/app" as string | null),
    filePath: pick(r, "filePath", null as string | null),
    packageName: pick(r, "packageName", null as string | null),
    algorithm: pick(r, "algorithm", null as string | null),
    purpose: pick(r, "purpose", null as string | null),
    quantumClass: pick(r, "quantumClass", "QUANTUM_VULNERABLE"),
    confidence: pick(r, "confidence", 90),
  };
}

test("multiple findings on the same file+algorithm+purpose merge into one group", () => {
  const findings = [
    obs({ id: "a", sensorType: "CRYPTOSCAN", filePath: "src/auth/jwt.ts", algorithm: "RSA-2048", purpose: "DIGITAL_SIGNATURE" }),
    obs({ id: "b", sensorType: "SEMGREP", filePath: "src/auth/jwt.ts", algorithm: "RSA-2048", purpose: "DIGITAL_SIGNATURE", confidence: 95 }),
    obs({ id: "c", sensorType: "CRYPTODEPS", filePath: "src/auth/jwt.ts", algorithm: "RSA-2048", purpose: "DIGITAL_SIGNATURE", confidence: 70 }),
  ];
  const groups = correlateObservations(findings);
  assert.equal(groups.length, 1, "should form exactly one group");
  assert.equal(groups[0].observationIds.length, 3);
  assert.deepEqual(groups[0].evidenceSources, ["CRYPTODEPS", "CRYPTOSCAN", "SEMGREP"]);
  assert.equal(groups[0].confidence, 95, "confidence is the max across members");
  assert.deepEqual(groups[0].affectedFiles, ["src/auth/jwt.ts"]);
});

test("same algorithm in DIFFERENT files is NOT merged (conservative)", () => {
  const findings = [
    obs({ id: "a", filePath: "src/serviceA/crypto.ts", algorithm: "RSA-2048", purpose: "ENCRYPTION" }),
    obs({ id: "b", filePath: "src/serviceB/crypto.ts", algorithm: "RSA-2048", purpose: "ENCRYPTION" }),
  ];
  const groups = correlateObservations(findings, { minGroupSize: 1 });
  assert.equal(groups.length, 2, "different files must remain separate cases");
});

test("same file but DIFFERENT purpose is NOT merged", () => {
  const findings = [
    obs({ id: "a", filePath: "src/crypto.ts", algorithm: "ECDSA", purpose: "DIGITAL_SIGNATURE" }),
    obs({ id: "b", filePath: "src/crypto.ts", algorithm: "ECDSA", purpose: "KEY_AGREEMENT" }),
  ];
  const groups = correlateObservations(findings, { minGroupSize: 1 });
  assert.equal(groups.length, 2, "different cryptographic purposes must remain separate");
});

test("findings in different repositories are NOT merged", () => {
  const findings = [
    obs({ id: "a", repoUrl: "https://github.com/acme/app", filePath: "x.ts", algorithm: "MD5", purpose: "HASHING" }),
    obs({ id: "b", repoUrl: "https://github.com/acme/other", filePath: "x.ts", algorithm: "MD5", purpose: "HASHING" }),
  ];
  const groups = correlateObservations(findings, { minGroupSize: 1 });
  assert.equal(groups.length, 2, "different repos must remain separate");
});

test("observation with no repo is not correlated (insufficient evidence)", () => {
  assert.equal(correlationKeyFor(obs({ repoUrl: null, filePath: "x.ts", algorithm: "RSA" })), null);
});

test("observation with no algorithm is not correlated", () => {
  assert.equal(correlationKeyFor(obs({ filePath: "x.ts", algorithm: null })), null);
});

test("observation with neither file nor package is not correlated", () => {
  assert.equal(correlationKeyFor(obs({ filePath: null, packageName: null, algorithm: "RSA" })), null);
});

test("dependency-level findings correlate on repo+package+algorithm", () => {
  const findings = [
    obs({ id: "a", sensorType: "CRYPTODEPS", filePath: null, packageName: "jsonwebtoken", algorithm: "RSA" }),
    obs({ id: "b", sensorType: "GRYPE", filePath: null, packageName: "jsonwebtoken", algorithm: "RSA" }),
  ];
  const groups = correlateObservations(findings);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].locusType, "DEPENDENCY");
  assert.deepEqual(groups[0].affectedDependencies, ["jsonwebtoken"]);
});

test("singletons are excluded by default (minGroupSize=2)", () => {
  const groups = correlateObservations([
    obs({ id: "solo", filePath: "src/only.ts", algorithm: "SHA-1", purpose: "HASHING" }),
  ]);
  assert.equal(groups.length, 0, "a lone finding forms no correlation group by default");
});
