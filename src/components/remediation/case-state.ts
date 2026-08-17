/**
 * Presentation-only derivation of a case's operational state.
 *
 * Nothing here decides anything: it reads what the engines already concluded and
 * expresses it for an operator. Two rules govern it —
 *
 *  1. Scanner evidence outranks the AI. A verification verdict, where one
 *     exists, is the case's status. An AI strategy is only ever a proposal.
 *  2. Never assert more than the data supports. Where policy was not applied, or
 *     no verification has run, that is stated as such rather than inferred.
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type PolicyState = "APPROVED" | "BLOCKED" | "NOT_APPLIED";
export type ActionKind =
  | "REVIEW_CASE" | "REVIEW_DECISION" | "REVIEW_PATCH"
  | "REVIEW_VERIFICATION" | "INVESTIGATE" | "REVIEW_FAILURE" | "IN_PROGRESS";

/** Serialisable row handed from the server page to the client list. */
export interface CaseRow {
  id: string;
  ref: string;
  algorithm: string | null;
  purpose: string | null;
  title: string;
  createdAt: string;
  confidence: number;
  findingCount: number;
  affectedFileCount: number;
  scanners: string[];
  quantumClass: string;
  primitiveType: string | null;
  caseStatus: string;
  aiStrategy: string | null;
  policyVersion: string | null;
  policyState: PolicyState;
  verdict: string | null;          // terminal verification verdict, if any
  attemptCount: number;
  hasPatch: boolean;
  attemptStatus: string | null;
  /** Name of the person this review is assigned to, if anyone. */
  assignedTo: string | null;
}

const IN_FLIGHT = new Set(["PENDING", "INVESTIGATING", "PLANNING", "PATCHING", "VERIFYING"]);
const GOOD_VERDICTS = new Set(["VERIFIED", "VERIFIED_WITH_WARNINGS"]);
const BAD_VERDICTS = new Set(["FAILED", "REGRESSED", "BUILD_FAILED", "TEST_FAILED", "SCAN_FAILED", "TIMEOUT", "VERIFICATION_ERROR"]);

/**
 * Severity from scanner evidence. Quantum exposure of a PUBLIC-KEY primitive is
 * the urgent class: it is broken outright by Shor's algorithm. The same quantum
 * class on a hash or MAC is serious but not equivalent, so it is not shown as
 * though it were.
 */
export function deriveSeverity(quantumClass: string, primitiveType: string | null): Severity {
  const publicKey = ["DIGITAL_SIGNATURE", "KEY_ESTABLISHMENT", "PUBLIC_KEY_ENCRYPTION"].includes(String(primitiveType));
  switch (quantumClass) {
    case "QUANTUM_VULNERABLE":       return publicKey ? "CRITICAL" : "HIGH";
    case "QUANTUM_REDUCED_SECURITY": return "MEDIUM";
    case "HYBRID":                   return "MEDIUM";
    case "POST_QUANTUM":
    case "QUANTUM_RESILIENT":        return "LOW";
    default:                         return "UNKNOWN";
  }
}

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

export const SEVERITY_STYLE: Record<Severity, { color: string; bg: string }> = {
  CRITICAL: { color: "#B91C1C", bg: "#FEE2E2" },
  HIGH:     { color: "#C2410C", bg: "#FFEDD5" },
  MEDIUM:   { color: "#B45309", bg: "#FEF3C7" },
  LOW:      { color: "#15803D", bg: "#DCFCE7" },
  UNKNOWN:  { color: "#64748B", bg: "#F1F5F9" },
};

/** What the operator is being asked to do, and why that is the next step. */
export function deriveAction(row: CaseRow): { kind: ActionKind; label: string } {
  if (row.policyState === "BLOCKED")                    return { kind: "REVIEW_DECISION", label: "Review decision" };
  if (row.attemptCount === 0)                           return { kind: "REVIEW_CASE", label: "Review case" };
  if (row.aiStrategy === "MANUAL_REVIEW")               return { kind: "INVESTIGATE", label: "Investigate" };
  if (row.verdict && GOOD_VERDICTS.has(row.verdict))    return { kind: "REVIEW_VERIFICATION", label: "Review verification" };
  if (row.verdict && BAD_VERDICTS.has(row.verdict))     return { kind: "REVIEW_FAILURE", label: "Review failure" };
  if (row.attemptStatus && IN_FLIGHT.has(row.attemptStatus)) return { kind: "IN_PROGRESS", label: "In progress" };
  if (row.hasPatch)                                     return { kind: "REVIEW_PATCH", label: "Review patch" };
  return { kind: "REVIEW_CASE", label: "Review case" };
}

/** Filter keys the operator can toggle. */
export type FilterKey =
  | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  | "QUANTUM_VULNERABLE" | "MANUAL_REVIEW" | "POLICY_BLOCKED"
  | "AWAITING" | "IN_PROGRESS" | "VERIFIED" | "VERIFIED_WITH_WARNINGS"
  | "FAILED" | "REGRESSED";

export function matchesFilter(row: CaseRow, key: FilterKey): boolean {
  const sev = deriveSeverity(row.quantumClass, row.primitiveType);
  switch (key) {
    case "CRITICAL": case "HIGH": case "MEDIUM": case "LOW": return sev === key;
    case "QUANTUM_VULNERABLE":     return row.quantumClass === "QUANTUM_VULNERABLE";
    case "MANUAL_REVIEW":          return row.aiStrategy === "MANUAL_REVIEW";
    case "POLICY_BLOCKED":         return row.policyState === "BLOCKED";
    case "AWAITING":               return row.attemptCount === 0;
    case "IN_PROGRESS":            return !!row.attemptStatus && IN_FLIGHT.has(row.attemptStatus);
    case "VERIFIED":               return row.verdict === "VERIFIED";
    case "VERIFIED_WITH_WARNINGS": return row.verdict === "VERIFIED_WITH_WARNINGS";
    case "FAILED":                 return row.verdict === "FAILED";
    case "REGRESSED":              return row.verdict === "REGRESSED";
  }
}

export type SortKey = "SEVERITY" | "CONFIDENCE" | "NEWEST" | "OLDEST" | "VERIFICATION";

/** Verification ordering puts what needs attention first, unverified last. */
const VERIFICATION_RANK = (v: string | null): number => {
  if (!v) return 5;
  if (BAD_VERDICTS.has(v)) return 0;
  if (v === "VERIFIED_WITH_WARNINGS") return 1;
  if (v === "VERIFIED") return 2;
  return 3;
};

export function sortRows(rows: CaseRow[], key: SortKey): CaseRow[] {
  const out = [...rows];
  switch (key) {
    case "SEVERITY":
      return out.sort((a, b) =>
        SEVERITY_RANK[deriveSeverity(a.quantumClass, a.primitiveType)] - SEVERITY_RANK[deriveSeverity(b.quantumClass, b.primitiveType)]
        || b.confidence - a.confidence);
    case "CONFIDENCE":   return out.sort((a, b) => b.confidence - a.confidence);
    case "NEWEST":       return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "OLDEST":       return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "VERIFICATION": return out.sort((a, b) => VERIFICATION_RANK(a.verdict) - VERIFICATION_RANK(b.verdict) || b.confidence - a.confidence);
  }
}

export const isGoodVerdict = (v: string | null) => !!v && GOOD_VERDICTS.has(v);
export const isBadVerdict = (v: string | null) => !!v && BAD_VERDICTS.has(v);
