// Stable finding identity for before/after comparison.
//
// A fingerprint deliberately EXCLUDES line/column numbers, because a legitimate
// code change moves lines without changing the underlying issue. Identity is
// derived from the scanner, the rule/algorithm, the normalized file location
// (path only), and the dependency — whichever are present.

export interface FindingIdentity {
  scanner: string;
  algorithm?: string | null;
  ruleId?: string | null;
  filePath?: string | null;
  dependency?: string | null;   // package name, if a dependency-level finding
  severity?: string | null;
}

/** Normalize a file path to a stable locus: forward slashes, no line/col, lowercased. */
export function normalizeLocation(filePath?: string | null): string | null {
  if (!filePath) return null;
  let p = filePath.trim().replace(/\\/g, "/");
  // Strip trailing :line or :line:col
  p = p.replace(/:\d+(:\d+)?$/, "");
  // Strip a leading ./ and any leading slash for repo-relative stability
  p = p.replace(/^\.?\//, "");
  return p.toLowerCase() || null;
}

/** Deterministic fingerprint string. Same issue → same fingerprint across scans. */
export function fingerprintFinding(f: FindingIdentity): string {
  const rule = (f.ruleId ?? f.algorithm ?? "").trim().toLowerCase();
  const loc = normalizeLocation(f.filePath) ?? "";
  const dep = (f.dependency ?? "").trim().toLowerCase();
  return [f.scanner.trim().toLowerCase(), rule, loc, dep].join("|");
}

/**
 * A weaker "issue class" key that ignores location — used to detect a finding
 * that has MOVED (same scanner + rule/algorithm + dependency, different file).
 */
export function issueClassKey(f: FindingIdentity): string {
  const rule = (f.ruleId ?? f.algorithm ?? "").trim().toLowerCase();
  const dep = (f.dependency ?? "").trim().toLowerCase();
  return [f.scanner.trim().toLowerCase(), rule, dep].join("|");
}
