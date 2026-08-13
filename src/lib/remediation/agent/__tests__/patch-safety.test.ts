import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRelPath, looksBinary, unifiedDiff, validateChange, PatchValidationError } from "../patch-safety";

test("path traversal is rejected", () => {
  assert.throws(() => validateRelPath("../../etc/passwd"), PatchValidationError);
  assert.throws(() => validateRelPath("a/../../b"), PatchValidationError);
});

test("absolute paths are rejected", () => {
  assert.throws(() => validateRelPath("/etc/passwd"), PatchValidationError);
  assert.throws(() => validateRelPath("C:\\Windows\\x"), PatchValidationError);
});

test("NUL byte is rejected", () => {
  assert.throws(() => validateRelPath("a\0b"), PatchValidationError);
});

test("valid repo-relative path is accepted and normalized", () => {
  assert.equal(validateRelPath("src\\auth\\jwt.ts"), "src/auth/jwt.ts");
});

test("binary content is detected", () => {
  assert.equal(looksBinary("hello\0world"), true);
  assert.equal(looksBinary("plain text"), false);
});

test("validateChange rejects binary and oversize content", () => {
  assert.throws(() => validateChange({ filePath: "a.ts", changeType: "MODIFY", newContent: "x\0y" }, () => "orig"), PatchValidationError);
});

test("validateChange produces hashes and a diff", () => {
  const v = validateChange({ filePath: "a.ts", changeType: "MODIFY", newContent: "line1\nCHANGED\n" }, () => "line1\nold\n");
  assert.ok(v.originalHash && v.patchedHash);
  assert.notEqual(v.originalHash, v.patchedHash);
  assert.match(v.diffPatch, /--- a\/a\.ts/);
  assert.match(v.diffPatch, /\+CHANGED/);
});

test("unified diff marks removed and added lines", () => {
  const d = unifiedDiff("a\nb\nc", "a\nX\nc", "f.ts");
  assert.match(d, /-b/);
  assert.match(d, /\+X/);
});
