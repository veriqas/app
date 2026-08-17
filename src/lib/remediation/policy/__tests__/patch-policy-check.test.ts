import { test } from "node:test";
import assert from "node:assert/strict";
import { findProhibitedIntroductions } from "../patch-policy-check";
import { evaluateStrategyPolicy } from "../strategy-policy";
import type { PolicyInput } from "../policy-types";

const rsaPolicy = evaluateStrategyPolicy({
  algorithm: "RSA-2048", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE",
  evidenceSources: ["CRYPTOSCAN_AST"], affectedDependencies: [],
  operation: "sign", purposeRaw: "JWT signing", dataProtected: "auth tokens",
  isGenuine: true, scope: "SYSTEMIC", dependents: ["signAuthToken"], confidence: 0.9,
  migrationConstraints: [],
} as PolicyInput);

const ORIGINAL_RSA = `
import jwt from 'jsonwebtoken';
const signOptions = { algorithm: 'RS256' };
export function signAuthToken(c) { return jwt.sign(c, key, signOptions); }
`;

// ── The exact loophole this phase exists to close ──
test("declared HYBRID_PQC_MIGRATION but the patch is Ed25519-only: rejected", () => {
  const patched = `
import { SignJWT } from 'jose';
// Migrated from RSA-2048 to Ed25519 (EdDSA) signing.
const alg = 'EdDSA';
export async function signAuthToken(c) { return new SignJWT(c).setProtectedHeader({ alg }).sign(key); }
`;
  const v = findProhibitedIntroductions(
    [{ filePath: "src/auth/jwt.ts", originalContent: ORIGINAL_RSA, newContent: patched }],
    rsaPolicy.prohibitedTargets,
  );
  assert.ok(v.length > 0, "an Ed25519-only migration must be rejected before verification");
  assert.ok(v.some(x => /ed25519|eddsa/i.test(x.target)));
});

test("a genuine PQC migration is accepted", () => {
  const patched = `
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
export function signAuthToken(c) { return ml_dsa65.sign(secretKey, encode(c)); }
`;
  const v = findProhibitedIntroductions(
    [{ filePath: "src/auth/jwt.ts", originalContent: ORIGINAL_RSA, newContent: patched }],
    rsaPolicy.prohibitedTargets,
  );
  assert.deepEqual(v, [], "ML-DSA is a permitted target");
});

test("the pre-existing prohibited algorithm is not itself a violation", () => {
  // RSA remains in the file; that is the finding under remediation, and whether
  // it survives is the verifier's call, not the policy's.
  const patched = ORIGINAL_RSA + "\n// unrelated comment\n";
  const v = findProhibitedIntroductions(
    [{ filePath: "src/auth/jwt.ts", originalContent: ORIGINAL_RSA, newContent: patched }],
    rsaPolicy.prohibitedTargets,
  );
  assert.deepEqual(v, [], "only newly introduced primitives are policy violations");
});

test("prohibited primitives are caught in Python and Java, not only JS/TS", () => {
  const py = findProhibitedIntroductions(
    [{ filePath: "app/signing.py", originalContent: "import rsa\n", newContent: "from nacl.signing import SigningKey  # ed25519\n" }],
    rsaPolicy.prohibitedTargets,
  );
  assert.ok(py.length > 0, "python patch must be checked");

  const java = findProhibitedIntroductions(
    [{ filePath: "src/A.java", originalContent: "Signature.getInstance(\"SHA256withRSA\");", newContent: "Signature.getInstance(\"Ed25519\");" }],
    rsaPolicy.prohibitedTargets,
  );
  assert.ok(java.length > 0, "java patch must be checked");
});

test("X25519 is rejected as a key-establishment replacement", () => {
  const kemPolicy = evaluateStrategyPolicy({
    algorithm: "RSA-2048", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE",
    evidenceSources: ["CRYPTOSCAN_AST"], affectedDependencies: [], operation: "keyExchange",
    purposeRaw: "key exchange", dataProtected: "session keys", isGenuine: true,
    scope: "SYSTEMIC", dependents: ["handshake"], confidence: 0.9, migrationConstraints: [],
  } as PolicyInput);
  const v = findProhibitedIntroductions(
    [{ filePath: "src/kex.ts", originalContent: "// rsa key transport", newContent: "import { x25519 } from '@noble/curves/ed25519';" }],
    kemPolicy.prohibitedTargets,
  );
  assert.ok(v.length > 0);
});

test("no prohibited targets means nothing is blocked", () => {
  assert.deepEqual(findProhibitedIntroductions([{ filePath: "a.ts", originalContent: "", newContent: "anything at all" }], []), []);
});

test("substring collisions do not produce false violations", () => {
  // "rsa" inside an unrelated word must not fire.
  const v = findProhibitedIntroductions(
    [{ filePath: "a.ts", originalContent: "", newContent: "const personalisation = 'universal parsable'; // no crypto here" }],
    ["rsa", "dsa"],
  );
  assert.deepEqual(v, [], "token matching must respect word boundaries");
});

test("violations name the file, the target and how it was detected", () => {
  const v = findProhibitedIntroductions(
    [{ filePath: "src/auth/jwt.ts", originalContent: ORIGINAL_RSA, newContent: "const alg = 'EdDSA';" }],
    rsaPolicy.prohibitedTargets,
  );
  assert.equal(v[0].filePath, "src/auth/jwt.ts");
  assert.ok(v[0].evidence.length > 0);
  assert.ok(["AST", "IDENTIFIER"].includes(v[0].detectedBy));
});

// ── Comments describe a fix; they do not introduce a primitive ──
test("documenting the replaced primitive in a comment is not a violation", () => {
  const java = findProhibitedIntroductions([{
    filePath: "src/main/java/TokenSettings.java",
    originalContent: "/** Local configuration. */\npublic final class TokenSettings { }",
    newContent: `/**
 * TOKEN_PEPPER is now used as an HMAC-SHA256 key, not concatenated into an
 * RSA-signed or Ed25519-signed payload as it was previously.
 */
public final class TokenSettings { }`,
  }], ["ed25519", "rsa"]);
  assert.deepEqual(java, [], "a comment explaining the migration must not be rejected");
});

test("a prohibited primitive in a real string literal is still caught", () => {
  const v = findProhibitedIntroductions([{
    filePath: "src/A.java",
    originalContent: 'Signature.getInstance("SHA256withRSA");',
    newContent: '// migrating away from RSA\nSignature.getInstance("Ed25519");',
  }], ["ed25519"]);
  assert.ok(v.length > 0, "string-literal usage must still be detected");
});

test("python comments and docstrings are stripped, code is not", () => {
  const ok = findProhibitedIntroductions([{
    filePath: "app/t.py",
    originalContent: "import hashlib",
    newContent: '"""Replaces the old ed25519 signing path."""\n# previously ed25519\nimport hmac',
  }], ["ed25519"]);
  assert.deepEqual(ok, [], "docstring and # comment mentions are not introductions");

  const bad = findProhibitedIntroductions([{
    filePath: "app/t.py",
    originalContent: "import hashlib",
    newContent: "from nacl.signing import SigningKey\nkey = SigningKey.generate()  # ed25519",
  }], ["ed25519", "signingkey"]);
  assert.ok(bad.length > 0, "actual code must still be detected");
});
