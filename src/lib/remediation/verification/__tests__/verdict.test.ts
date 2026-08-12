import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateVerdict, canTransition, isTerminal } from "../verdict";
import type { ComparisonResult } from "../comparator";

function cmp(p: Partial<ComparisonResult["summary"]>): ComparisonResult {
  const summary = { resolved: 0, residual: 0, moved: 0, newHigh: 0, newLow: 0, ...p };
  const mk = (n: number) => Array.from({ length: n }, () => ({ scanner: "X" }));
  return {
    resolved: mk(summary.resolved), residual: mk(summary.residual), moved: mk(summary.moved),
    newFindings: mk(summary.newHigh + summary.newLow), newHigh: mk(summary.newHigh), newLow: mk(summary.newLow),
    summary,
  } as unknown as ComparisonResult;
}

test("all resolved, no new, build/test pass → VERIFIED", () => {
  const v = calculateVerdict({ comparison: cmp({ resolved: 1 }), buildStatus: "PASS", testStatus: "PASS" });
  assert.equal(v.state, "VERIFIED");
});

test("residual finding → FAILED", () => {
  assert.equal(calculateVerdict({ comparison: cmp({ residual: 1 }) }).state, "FAILED");
});

test("moved finding → FAILED", () => {
  assert.equal(calculateVerdict({ comparison: cmp({ moved: 1 }) }).state, "FAILED");
});

test("original fixed but new HIGH/CRITICAL → REGRESSED (never VERIFIED)", () => {
  const v = calculateVerdict({ comparison: cmp({ resolved: 1, newHigh: 1 }), buildStatus: "PASS", testStatus: "PASS" });
  assert.equal(v.state, "REGRESSED");
});

test("original fixed, only new LOW → VERIFIED_WITH_WARNINGS", () => {
  assert.equal(calculateVerdict({ comparison: cmp({ resolved: 1, newLow: 2 }) }).state, "VERIFIED_WITH_WARNINGS");
});

test("build failure → BUILD_FAILED (overrides scanner comparison)", () => {
  assert.equal(calculateVerdict({ comparison: cmp({ resolved: 1 }), buildStatus: "FAIL" }).state, "BUILD_FAILED");
});

test("test failure → TEST_FAILED", () => {
  assert.equal(calculateVerdict({ comparison: cmp({ resolved: 1 }), buildStatus: "PASS", testStatus: "FAIL" }).state, "TEST_FAILED");
});

test("scanner failure → SCAN_FAILED", () => {
  assert.equal(calculateVerdict({ scanFailed: true, comparison: cmp({ resolved: 1 }) }).state, "SCAN_FAILED");
});

test("infra error (Docker down) → VERIFICATION_ERROR, never VERIFIED", () => {
  assert.equal(calculateVerdict({ infraError: true, comparison: cmp({ resolved: 1 }) }).state, "VERIFICATION_ERROR");
});

test("timeout → TIMEOUT", () => {
  assert.equal(calculateVerdict({ timedOut: true }).state, "TIMEOUT");
});

test("no baseline → NO_BASELINE", () => {
  assert.equal(calculateVerdict({ noBaseline: true }).state, "NO_BASELINE");
});

test("precedence: timeout beats residual", () => {
  assert.equal(calculateVerdict({ timedOut: true, comparison: cmp({ residual: 1 }) }).state, "TIMEOUT");
});

test("state machine: valid forward transition and terminal finality", () => {
  assert.equal(canTransition("PENDING", "RUNNING"), true);
  assert.equal(canTransition("RESCANNING", "COMPARING"), true);
  assert.equal(canTransition("RUNNING", "TIMEOUT"), true, "can fail from any lifecycle state");
  assert.equal(canTransition("VERIFIED", "RUNNING"), false, "terminal is final");
  assert.equal(isTerminal("VERIFIED"), true);
  assert.equal(isTerminal("RESCANNING"), false);
});
