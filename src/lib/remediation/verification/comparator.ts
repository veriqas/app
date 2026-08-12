// Before/after finding comparison — the heart of verification.
//
// Classifies each baseline (BEFORE) finding as resolved / residual / moved, and
// each post-remediation (AFTER) finding as a genuine new issue. Comparison uses
// stable fingerprints (not line numbers). A finding that merely MOVED to another
// location is NOT treated as resolved.

import { fingerprintFinding, issueClassKey, type FindingIdentity } from "./fingerprint";

export interface ComparableFinding extends FindingIdentity {
  fingerprint?: string; // precomputed optional; derived if absent
}

export interface ComparisonResult {
  resolved: ComparableFinding[];   // baseline finding genuinely gone
  residual: ComparableFinding[];   // baseline finding still present (same fingerprint)
  moved: ComparableFinding[];      // same issue class reappears at a different location
  newFindings: ComparableFinding[];// findings present only after remediation
  newHigh: ComparableFinding[];    // subset of newFindings with HIGH/CRITICAL severity
  newLow: ComparableFinding[];     // subset of newFindings below HIGH
  summary: {
    resolved: number; residual: number; moved: number;
    newHigh: number; newLow: number;
  };
}

const HIGH_SEVERITIES = new Set(["HIGH", "CRITICAL"]);

function fp(f: ComparableFinding): string {
  return f.fingerprint ?? fingerprintFinding(f);
}

function isHigh(sev?: string | null): boolean {
  return HIGH_SEVERITIES.has((sev ?? "").trim().toUpperCase());
}

export function compareFindings(before: ComparableFinding[], after: ComparableFinding[]): ComparisonResult {
  const afterByFp = new Map(after.map(a => [fp(a), a]));
  const afterIssueClasses = new Set(after.map(issueClassKey));
  const beforeByFp = new Map(before.map(b => [fp(b), b]));
  const beforeIssueClasses = new Set(before.map(issueClassKey));

  const resolved: ComparableFinding[] = [];
  const residual: ComparableFinding[] = [];
  const moved: ComparableFinding[] = [];

  for (const b of before) {
    if (afterByFp.has(fp(b))) {
      residual.push(b);                       // exact same finding still there
    } else if (afterIssueClasses.has(issueClassKey(b))) {
      moved.push(b);                          // same issue class, different location
    } else {
      resolved.push(b);                       // genuinely gone
    }
  }

  // Genuine new findings: present after, not present before, and not the moved
  // counterpart of a baseline issue class.
  const movedIssueClasses = new Set(moved.map(issueClassKey));
  const newFindings: ComparableFinding[] = [];
  for (const a of after) {
    if (beforeByFp.has(fp(a))) continue;                 // residual (counted from before)
    if (movedIssueClasses.has(issueClassKey(a))) continue; // relocation of a baseline issue
    if (beforeIssueClasses.has(issueClassKey(a)) && !afterByFp.has(fp(a))) {
      // Same class as a baseline finding but different fingerprint and the
      // baseline one is gone — this is the relocated instance, not new.
      continue;
    }
    newFindings.push(a);
  }

  const newHigh = newFindings.filter(f => isHigh(f.severity));
  const newLow = newFindings.filter(f => !isHigh(f.severity));

  return {
    resolved, residual, moved, newFindings, newHigh, newLow,
    summary: {
      resolved: resolved.length, residual: residual.length, moved: moved.length,
      newHigh: newHigh.length, newLow: newLow.length,
    },
  };
}
