// Deterministic verdict calculation and verification state machine.
//
// The verdict is a pure function of EVIDENCE (scanner comparison, build, test,
// infrastructure health) — it takes no AI input, so the AI can never override
// the scanners. Safety-first precedence: infrastructure/build/test failures and
// residual/moved findings block VERIFIED; a new HIGH/CRITICAL finding yields
// REGRESSED (never VERIFIED).

import type { ComparisonResult } from "./comparator";

export type BuildTestStatus = "NOT_RUN" | "SKIPPED" | "PASS" | "FAIL";

// Non-terminal lifecycle states.
export const LIFECYCLE_STATES = [
  "PENDING", "RUNNING", "BASELINING", "BUILDING", "TESTING", "RESCANNING", "COMPARING",
] as const;

// Terminal states (verdicts / outcomes).
export const TERMINAL_STATES = [
  "VERIFIED", "VERIFIED_WITH_WARNINGS", "FAILED", "REGRESSED",
  "BUILD_FAILED", "TEST_FAILED", "SCAN_FAILED",
  "TIMEOUT", "VERIFICATION_ERROR", "CANCELLED", "NO_BASELINE",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];
export type TerminalState = (typeof TERMINAL_STATES)[number];
export type VerificationState = LifecycleState | TerminalState;

const TERMINAL_SET = new Set<string>(TERMINAL_STATES);
export function isTerminal(s: string): boolean {
  return TERMINAL_SET.has(s);
}

// Allowed forward transitions. Any lifecycle state may also jump straight to a
// terminal state (failure/timeout/cancel can happen at any point).
const FORWARD: Record<LifecycleState, LifecycleState[]> = {
  PENDING: ["RUNNING"],
  RUNNING: ["BASELINING"],
  BASELINING: ["BUILDING", "RESCANNING"], // build/test are optional
  BUILDING: ["TESTING", "RESCANNING"],
  TESTING: ["RESCANNING"],
  RESCANNING: ["COMPARING"],
  COMPARING: [],
};

export function canTransition(from: string, to: string): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;           // terminal is final
  if (isTerminal(to)) return true;              // may fail/timeout/cancel any time
  const allowed = FORWARD[from as LifecycleState];
  return !!allowed && allowed.includes(to as LifecycleState);
}

export interface VerdictInput {
  noBaseline?: boolean;
  timedOut?: boolean;
  infraError?: boolean;      // e.g. Docker unavailable — never a false VERIFIED
  scanFailed?: boolean;      // a relevant scanner errored
  buildStatus?: BuildTestStatus;
  testStatus?: BuildTestStatus;
  comparison?: ComparisonResult;
}

export interface Verdict {
  state: TerminalState;
  reason: string;
}

/**
 * Compute the terminal verdict. Precedence (highest first):
 *   NO_BASELINE > TIMEOUT > VERIFICATION_ERROR > SCAN_FAILED >
 *   BUILD_FAILED > TEST_FAILED > FAILED(residual/moved) > REGRESSED(new high) >
 *   VERIFIED_WITH_WARNINGS(new low) > VERIFIED
 */
export function calculateVerdict(input: VerdictInput): Verdict {
  if (input.noBaseline) return { state: "NO_BASELINE", reason: "No baseline findings were captured; nothing to verify against." };
  if (input.timedOut) return { state: "TIMEOUT", reason: "Verification exceeded its deadline before a verdict could be reached." };
  if (input.infraError) return { state: "VERIFICATION_ERROR", reason: "Verification infrastructure was unavailable (e.g. scanner environment/Docker). Reported as an error, never as verified." };
  if (input.scanFailed) return { state: "SCAN_FAILED", reason: "A relevant scanner failed to run during re-scan; cannot confirm resolution." };
  if (input.buildStatus === "FAIL") return { state: "BUILD_FAILED", reason: "The project build failed after the change." };
  if (input.testStatus === "FAIL") return { state: "TEST_FAILED", reason: "The project tests failed after the change." };

  const c = input.comparison;
  if (!c) return { state: "VERIFICATION_ERROR", reason: "No comparison result was produced." };

  if (c.residual.length > 0) {
    return { state: "FAILED", reason: `${c.residual.length} original finding(s) are still detected by the scanners.` };
  }
  if (c.moved.length > 0) {
    return { state: "FAILED", reason: `${c.moved.length} original finding(s) appear to have moved rather than been resolved.` };
  }
  if (c.newHigh.length > 0) {
    return { state: "REGRESSED", reason: `Original finding(s) resolved, but ${c.newHigh.length} new HIGH/CRITICAL finding(s) were introduced. Not verified.` };
  }
  if (c.newLow.length > 0) {
    return { state: "VERIFIED_WITH_WARNINGS", reason: `Original finding(s) resolved; ${c.newLow.length} new lower-severity finding(s) noted for review.` };
  }
  // Full VERIFIED requires the build AND tests to have actually PASSED. When
  // build/test were SKIPPED/NOT_RUN (no isolated execution environment), the
  // remediation is SCANNER-verified only — reported with an explicit warning so
  // it is never conflated with a fully verified software change.
  const fullyBuilt = input.buildStatus === "PASS" && input.testStatus === "PASS";
  if (!fullyBuilt) {
    return {
      state: "VERIFIED_WITH_WARNINGS",
      reason: "Remediation was verified against the relevant security scanners (original findings resolved, no new serious findings), but build/test execution was not performed because no isolated execution environment is available. This is scanner-verified, not a fully verified software change.",
    };
  }
  return { state: "VERIFIED", reason: "All original findings are resolved by scanner evidence, the build and tests passed, and no new serious findings were introduced." };
}
