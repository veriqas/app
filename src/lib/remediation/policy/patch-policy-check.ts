/**
 * Post-generation patch policy enforcement.
 *
 * A planner can satisfy the policy syntactically — declaring
 * HYBRID_PQC_MIGRATION — while the code it actually writes introduces a
 * prohibited primitive such as Ed25519. Constraining the declared strategy alone
 * leaves that loophole open, which is precisely the RSA -> "hybrid" -> Ed25519
 * path this phase exists to close.
 *
 * So the generated CONTENT is checked against the policy's prohibited targets
 * before anything is applied or verified.
 *
 * Only NEWLY INTRODUCED primitives are violations. A prohibited algorithm that
 * was already in the file is the finding under remediation, not a new offence —
 * whether it still remains afterwards is the verifier's judgement, not the
 * policy's.
 *
 * This is a deterministic syntactic guard operating ahead of verification. It
 * does not replace the scanner: it stops an inadmissible patch from ever being
 * applied.
 */
// Relative import: this module is exercised by unit tests that do not resolve
// the "@/" path alias at runtime. The scanner is used read-only, as a library.
import { scanSourceText } from "../../scanners/engines/cryptoscan-ast-engine";
import { KNOWLEDGE_BASE, lookupAlgorithm } from "../agent/knowledge-base";

export interface PatchCandidate {
  filePath: string;
  originalContent: string | null;
  newContent: string | null;
}

export interface PatchPolicyViolation {
  filePath: string;
  target: string;
  evidence: string;
  detectedBy: "AST" | "IDENTIFIER";
}

const JS_TS = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

/**
 * Post-quantum names are masked out before prohibited-target matching.
 *
 * Without this, a legitimate migration to ML-DSA is rejected because "ml-dsa"
 * contains "dsa" — blocking exactly the remediation the policy is asking for.
 * Derived from the knowledge base so new PQC entries are covered automatically.
 */
function maskResilientNames(lower: string): string {
  const safe = new Set<string>();
  for (const e of Object.values(KNOWLEDGE_BASE)) {
    if (e.classification !== "RESILIENT") continue;
    for (const n of [e.algorithm, ...(e.aliases ?? [])]) {
      const base = n.toLowerCase();
      safe.add(base);
      safe.add(base.replace(/-/g, "_"));
      safe.add(base.replace(/-/g, ""));
    }
  }
  // Longest first so "ml-dsa" is masked before a shorter overlapping name.
  let out = lower;
  for (const name of [...safe].sort((a, b) => b.length - a.length)) {
    if (!name || name.length < 3) continue;
    out = out.split(name).join(" ".repeat(name.length));
  }
  return out;
}

/**
 * Remove comments before identifier matching.
 *
 * A patch that documents what it replaced ("...not as a string concatenated into
 * an MD5 digest") is describing the fix, not introducing the primitive. Matching
 * inside comments rejected a correct patch and consumed an attempt.
 *
 * String literals are deliberately KEPT: `Signature.getInstance("Ed25519")` is a
 * real introduction and must still be caught.
 */
export function stripComments(source: string, filePath: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");        // /* block */
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");            // // line (not URLs)
  if (/\.(py|pyi|rb|sh|yaml|yml|toml)$/i.test(filePath)) {
    out = out.replace(/"""[\s\S]*?"""/g, " ").replace(/'''[\s\S]*?'''/g, " "); // docstrings
    out = out.replace(/#[^\n]*/g, " ");                       // # line
  }
  return out;
}

/** Word-ish boundary match so "rsa" does not fire inside "personal". */
function containsToken(haystackLower: string, token: string): boolean {
  const t = token.toLowerCase();
  if (!haystackLower.includes(t)) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystackLower);
}

/**
 * Algorithms a change introduces that the policy prohibits.
 * For JS/TS the AST scanner is used read-only for precision; identifier matching
 * covers every language and catches spellings the AST layer does not model.
 */
export function findProhibitedIntroductions(
  changes: PatchCandidate[],
  prohibitedTargets: string[],
): PatchPolicyViolation[] {
  if (prohibitedTargets.length === 0) return [];
  const violations: PatchPolicyViolation[] = [];

  for (const change of changes) {
    const next = change.newContent ?? "";
    if (!next.trim()) continue;
    const prev = change.originalContent ?? "";
    const nextLower = maskResilientNames(stripComments(next, change.filePath).toLowerCase());
    const prevLower = maskResilientNames(stripComments(prev, change.filePath).toLowerCase());

    // 1. AST-precise pass for JS/TS: which algorithms does the new file actually use?
    if (JS_TS.test(change.filePath)) {
      let beforeAlgos = new Set<string>();
      let afterAlgos = new Set<string>();
      try {
        beforeAlgos = new Set(scanSourceText(prev, change.filePath).map(f => String(f.algorithm).toLowerCase()));
        afterAlgos = new Set(scanSourceText(next, change.filePath).map(f => String(f.algorithm).toLowerCase()));
      } catch { /* fall through to identifier matching */ }
      for (const algo of afterAlgos) {
        if (beforeAlgos.has(algo)) continue;                       // already present: not introduced
        if (lookupAlgorithm(algo)?.classification === "RESILIENT") continue; // a post-quantum target is the goal, not a violation
        const hit = prohibitedTargets.find(t => algo.includes(t.toLowerCase()) || t.toLowerCase().includes(algo));
        if (hit) {
          violations.push({ filePath: change.filePath, target: hit, detectedBy: "AST",
            evidence: `the patched file uses ${algo.toUpperCase()}, which the policy prohibits as a replacement` });
        }
      }
    }

    // 2. Identifier pass, all languages.
    for (const target of prohibitedTargets) {
      const introduced = containsToken(nextLower, target) && !containsToken(prevLower, target);
      if (!introduced) continue;
      if (violations.some(v => v.filePath === change.filePath && v.target.toLowerCase() === target.toLowerCase())) continue;
      violations.push({ filePath: change.filePath, target, detectedBy: "IDENTIFIER",
        evidence: `the patch introduces the identifier "${target}", which the policy prohibits as a replacement` });
    }
  }
  return violations;
}

export function describeViolations(violations: PatchPolicyViolation[]): string {
  return violations
    .map(v => `${v.filePath}: ${v.evidence} [${v.detectedBy}]`)
    .join("; ");
}
