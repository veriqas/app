// Unit tests for the remediation engine feature flag.
// Run: npx tsx --test src/lib/remediation/__tests__/feature-flag.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getRemediationEngine, isV2Enabled } from "../feature-flag";

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env.REMEDIATION_ENGINE;
  if (value === undefined) delete process.env.REMEDIATION_ENGINE;
  else process.env.REMEDIATION_ENGINE = value;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.REMEDIATION_ENGINE;
    else process.env.REMEDIATION_ENGINE = prev;
  }
}

test("defaults to v1 when unset", () => {
  withEnv(undefined, () => {
    assert.equal(getRemediationEngine(), "v1");
    assert.equal(isV2Enabled(), false);
  });
});

test("empty string resolves to v1", () => {
  withEnv("", () => assert.equal(getRemediationEngine(), "v1"));
});

test("v1 explicitly resolves to v1", () => {
  withEnv("v1", () => assert.equal(getRemediationEngine(), "v1"));
});

test("only the exact value v2 enables v2 (case-insensitive, trimmed)", () => {
  withEnv("v2", () => assert.equal(isV2Enabled(), true));
  withEnv(" V2 ", () => assert.equal(isV2Enabled(), true));
  withEnv("version2", () => assert.equal(isV2Enabled(), false));
  withEnv("2", () => assert.equal(isV2Enabled(), false));
});
