// Conservative finding correlation.
//
// Groups CryptoObservation findings that share a common root cause into a single
// logical remediation group. Correlation is DELIBERATELY conservative: false
// correlation (merging unrelated issues) is worse than leaving findings separate.
//
// A group is only formed when findings share strong, specific evidence — the same
// repository AND the same concrete locus (file or package) AND the same algorithm
// and cryptographic purpose. Two uses of the same algorithm in different files or
// services are NOT merged.
//
// This module is pure (no DB writes). It never mutates or deletes observations.

export interface CorrelatableObservation {
  id: string;
  sensorType: string;
  repoUrl: string | null;      // resolved from the scan job target
  filePath: string | null;
  packageName: string | null;
  algorithm: string | null;
  purpose: string | null;
  quantumClass: string;
  confidence: number;
}

export interface CorrelationGroup {
  correlationKey: string;
  locusType: "FILE" | "DEPENDENCY";
  repoUrl: string | null;
  algorithm: string | null;
  purpose: string | null;
  observationIds: string[];
  evidenceSources: string[];   // distinct sensorTypes contributing
  affectedFiles: string[];
  affectedDependencies: string[];
  confidence: number;          // max confidence across members
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Build the deterministic correlation key for an observation, or null if the
 * observation lacks sufficient evidence to be correlated (in which case it is
 * left as its own standalone finding and NOT grouped).
 */
export function correlationKeyFor(o: CorrelatableObservation): { key: string; locusType: "FILE" | "DEPENDENCY" } | null {
  // A repository anchor is required — without it we cannot establish that two
  // findings belong to the same codebase.
  if (!norm(o.repoUrl)) return null;
  // An algorithm is required — correlation is about a specific crypto primitive.
  if (!norm(o.algorithm)) return null;

  // Prefer a concrete file locus; fall back to a package locus for dependency findings.
  if (norm(o.filePath)) {
    return {
      key: `FILE|${norm(o.repoUrl)}|${norm(o.filePath)}|${norm(o.algorithm)}|${norm(o.purpose)}`,
      locusType: "FILE",
    };
  }
  if (norm(o.packageName)) {
    return {
      key: `DEP|${norm(o.repoUrl)}|${norm(o.packageName)}|${norm(o.algorithm)}`,
      locusType: "DEPENDENCY",
    };
  }
  // No file and no package → insufficient evidence to correlate.
  return null;
}

/**
 * Correlate a set of observations into conservative groups. Observations that
 * cannot be keyed are omitted from grouping entirely (they remain standalone
 * findings and are never deleted).
 *
 * Only groups containing 2+ observations are returned by default, since a
 * single-observation "group" adds no correlation value — callers that want
 * singletons can pass minGroupSize: 1.
 */
export function correlateObservations(
  observations: CorrelatableObservation[],
  opts: { minGroupSize?: number } = {}
): CorrelationGroup[] {
  const minGroupSize = opts.minGroupSize ?? 2;
  const buckets = new Map<string, { locusType: "FILE" | "DEPENDENCY"; members: CorrelatableObservation[] }>();

  for (const o of observations) {
    const keyed = correlationKeyFor(o);
    if (!keyed) continue; // insufficient evidence — leave standalone
    const bucket = buckets.get(keyed.key) ?? { locusType: keyed.locusType, members: [] };
    bucket.members.push(o);
    buckets.set(keyed.key, bucket);
  }

  const groups: CorrelationGroup[] = [];
  for (const [key, { locusType, members }] of buckets) {
    if (members.length < minGroupSize) continue;
    const first = members[0];
    groups.push({
      correlationKey: key,
      locusType,
      repoUrl: first.repoUrl,
      algorithm: first.algorithm,
      purpose: first.purpose,
      observationIds: members.map(m => m.id),
      evidenceSources: [...new Set(members.map(m => m.sensorType))].sort(),
      affectedFiles: [...new Set(members.map(m => m.filePath).filter((f): f is string => !!f))].sort(),
      affectedDependencies: [...new Set(members.map(m => m.packageName).filter((p): p is string => !!p))].sort(),
      confidence: Math.max(...members.map(m => m.confidence)),
    });
  }
  return groups;
}
