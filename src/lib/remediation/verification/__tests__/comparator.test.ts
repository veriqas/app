import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFindings, type ComparableFinding } from "../comparator";

const F = (p: Partial<ComparableFinding>): ComparableFinding => ({
  scanner: p.scanner ?? "CRYPTOSCAN",
  algorithm: p.algorithm ?? null,
  ruleId: p.ruleId ?? null,
  filePath: p.filePath ?? null,
  dependency: p.dependency ?? null,
  severity: p.severity ?? "HIGH",
});

test("finding present before and gone after → resolved", () => {
  const before = [F({ algorithm: "RSA-2048", filePath: "src/jwt.ts" })];
  const after: ComparableFinding[] = [];
  const r = compareFindings(before, after);
  assert.equal(r.summary.resolved, 1);
  assert.equal(r.summary.residual, 0);
});

test("finding still present after → residual (not resolved)", () => {
  const before = [F({ algorithm: "RSA-2048", filePath: "src/jwt.ts" })];
  const after = [F({ algorithm: "RSA-2048", filePath: "src/jwt.ts" })];
  const r = compareFindings(before, after);
  assert.equal(r.summary.residual, 1);
  assert.equal(r.summary.resolved, 0);
});

test("finding at same file but moved line → still residual (line ignored)", () => {
  const before = [F({ algorithm: "RSA-2048", filePath: "src/jwt.ts:10" })];
  const after = [F({ algorithm: "RSA-2048", filePath: "src/jwt.ts:200" })];
  const r = compareFindings(before, after);
  assert.equal(r.summary.residual, 1, "line move must not be treated as resolved");
});

test("finding moved to a different file → moved, not resolved", () => {
  const before = [F({ algorithm: "RSA-2048", filePath: "src/a.ts" })];
  const after = [F({ algorithm: "RSA-2048", filePath: "src/b.ts" })];
  const r = compareFindings(before, after);
  assert.equal(r.summary.moved, 1);
  assert.equal(r.summary.resolved, 0);
  assert.equal(r.summary.residual, 0);
});

test("new HIGH finding introduced → counted as newHigh", () => {
  const before = [F({ algorithm: "RSA-2048", filePath: "src/a.ts" })];
  const after = [F({ algorithm: "ECDSA", filePath: "src/c.ts", severity: "CRITICAL" })];
  const r = compareFindings(before, after);
  assert.equal(r.summary.resolved, 1, "original resolved");
  assert.equal(r.summary.newHigh, 1, "new critical finding detected");
});

test("new low-severity finding → newLow", () => {
  const before = [F({ algorithm: "RSA-2048", filePath: "src/a.ts" })];
  const after = [F({ algorithm: "SHA-256", filePath: "src/c.ts", severity: "LOW" })];
  const r = compareFindings(before, after);
  assert.equal(r.summary.newLow, 1);
  assert.equal(r.summary.newHigh, 0);
});
