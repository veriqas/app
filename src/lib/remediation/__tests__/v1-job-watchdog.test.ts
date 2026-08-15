import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaleRunning, v1TimeoutMs } from "../v1-job-watchdog";

const now = new Date("2026-01-01T12:00:00Z");
const TIMEOUT = 600_000; // 10 min

test("RUNNING before deadline is NOT stale", () => {
  const updated = new Date(now.getTime() - 60_000); // 1 min ago
  assert.equal(isStaleRunning("RUNNING", updated, now, TIMEOUT), false);
});

test("RUNNING after deadline IS stale", () => {
  const updated = new Date(now.getTime() - 700_000); // ~11.6 min ago
  assert.equal(isStaleRunning("RUNNING", updated, now, TIMEOUT), true);
});

test("exactly at the deadline is not yet stale (strictly greater)", () => {
  const updated = new Date(now.getTime() - TIMEOUT); // exactly 10 min
  assert.equal(isStaleRunning("RUNNING", updated, now, TIMEOUT), false);
});

for (const terminal of ["PENDING", "REVIEW", "APPROVED", "REJECTED", "FAILED", "APPLIED", "COMPLETED"]) {
  test(`${terminal} is NEVER stale, even long past the deadline`, () => {
    const updated = new Date(now.getTime() - 999_999_999);
    assert.equal(isStaleRunning(terminal, updated, now, TIMEOUT), false);
  });
}

test("default timeout is 10 minutes when env unset", () => {
  const prev = process.env.REMEDIATION_V1_TIMEOUT_MS;
  delete process.env.REMEDIATION_V1_TIMEOUT_MS;
  try { assert.equal(v1TimeoutMs(), 600_000); } finally { if (prev !== undefined) process.env.REMEDIATION_V1_TIMEOUT_MS = prev; }
});

test("env override is respected when valid", () => {
  const prev = process.env.REMEDIATION_V1_TIMEOUT_MS;
  process.env.REMEDIATION_V1_TIMEOUT_MS = "120000";
  try { assert.equal(v1TimeoutMs(), 120_000); } finally {
    if (prev === undefined) delete process.env.REMEDIATION_V1_TIMEOUT_MS; else process.env.REMEDIATION_V1_TIMEOUT_MS = prev;
  }
});

test("invalid env override falls back to default", () => {
  const prev = process.env.REMEDIATION_V1_TIMEOUT_MS;
  process.env.REMEDIATION_V1_TIMEOUT_MS = "not-a-number";
  try { assert.equal(v1TimeoutMs(), 600_000); } finally {
    if (prev === undefined) delete process.env.REMEDIATION_V1_TIMEOUT_MS; else process.env.REMEDIATION_V1_TIMEOUT_MS = prev;
  }
});
