import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintFinding, normalizeLocation, issueClassKey } from "../fingerprint";

test("line/column numbers do not affect the fingerprint", () => {
  const a = fingerprintFinding({ scanner: "CRYPTOSCAN", algorithm: "RSA-2048", filePath: "src/auth/jwt.ts:184" });
  const b = fingerprintFinding({ scanner: "CRYPTOSCAN", algorithm: "RSA-2048", filePath: "src/auth/jwt.ts:999:12" });
  assert.equal(a, b, "same file, different line → same fingerprint");
});

test("normalizeLocation strips lines, leading ./ and backslashes", () => {
  assert.equal(normalizeLocation("./Src\\Auth\\JWT.ts:10"), "src/auth/jwt.ts");
  assert.equal(normalizeLocation(null), null);
});

test("different files produce different fingerprints", () => {
  const a = fingerprintFinding({ scanner: "CRYPTOSCAN", algorithm: "RSA-2048", filePath: "src/a.ts" });
  const b = fingerprintFinding({ scanner: "CRYPTOSCAN", algorithm: "RSA-2048", filePath: "src/b.ts" });
  assert.notEqual(a, b);
});

test("issueClassKey ignores location (used for move detection)", () => {
  const a = issueClassKey({ scanner: "CRYPTOSCAN", algorithm: "RSA-2048", filePath: "src/a.ts" });
  const b = issueClassKey({ scanner: "CRYPTOSCAN", algorithm: "RSA-2048", filePath: "src/b.ts" });
  assert.equal(a, b, "same scanner+algorithm, different file → same issue class");
});

test("dependency findings fingerprint on package, not path", () => {
  const a = fingerprintFinding({ scanner: "CRYPTODEPS", algorithm: "RSA", dependency: "jsonwebtoken" });
  const b = fingerprintFinding({ scanner: "CRYPTODEPS", algorithm: "RSA", dependency: "jsonwebtoken" });
  assert.equal(a, b);
});
