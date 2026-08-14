// Builds RemediationCases from correlated observations.
//
// SAFETY CONTRACT:
//  - Reads observations; NEVER updates or deletes them.
//  - Idempotent: re-running does not duplicate cases or finding links.
//  - Additive only: writes to RemediationCase / RemediationCaseFinding.
//  - Only runs when the caller has confirmed V2 is enabled.

import { db } from "@/lib/db/client";
import { correlateObservations, type CorrelatableObservation } from "./correlation";

export interface BuildResult {
  casesCreated: number;
  casesUpdated: number;
  findingsLinked: number;
  observationsConsidered: number;
  groupsFormed: number;
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function titleFor(g: { algorithm: string | null; purpose: string | null; affectedFiles: string[]; affectedDependencies: string[] }): string {
  const algo = g.algorithm ?? "cryptography";
  const where = g.affectedFiles[0] ?? g.affectedDependencies[0] ?? "the codebase";
  const purpose = g.purpose ? ` (${g.purpose})` : "";
  return `Remediate ${algo}${purpose} in ${where}`;
}

/**
 * Correlate a tenant's active observations and persist RemediationCases.
 * Returns a summary. Does not throw on individual link conflicts (idempotent).
 */
export async function buildRemediationCases(tenantId: string): Promise<BuildResult> {
  // 1. Load active observations with their scan-job target (the repo anchor).
  const observations = await db.cryptoObservation.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true, sensorType: true, filePath: true, packageName: true,
      algorithm: true, purpose: true, quantumClass: true, confidence: true,
      scanJob: { select: { targets: true } },
    },
  });

  const correlatable: CorrelatableObservation[] = observations.map(o => ({
    id: o.id,
    sensorType: o.sensorType,
    repoUrl: o.scanJob?.targets?.[0] ?? null,
    filePath: o.filePath,
    packageName: o.packageName,
    algorithm: o.algorithm,
    purpose: o.purpose,
    quantumClass: o.quantumClass,
    confidence: o.confidence,
  }));

  // minGroupSize:1 — every keyable finding becomes a remediation case. Correlation
  // still MERGES corroborating findings (same repo+file+algorithm+purpose from
  // multiple scanners) into one case; a lone finding forms a single-evidence case
  // so it is still actionable. (The pure correlateObservations default stays 2.)
  const groups = correlateObservations(correlatable, { minGroupSize: 1 });

  let casesCreated = 0;
  let casesUpdated = 0;
  let findingsLinked = 0;

  for (const g of groups) {
    // Idempotency: reuse an existing non-terminal case for this correlation key.
    const existing = await db.remediationCase.findFirst({
      where: { tenantId, correlationKey: g.correlationKey, status: { notIn: ["DISMISSED", "VERIFIED"] } },
      select: { id: true },
    });

    let caseId: string;
    if (existing) {
      caseId = existing.id;
      await db.remediationCase.update({
        where: { id: caseId },
        data: {
          evidenceSources: g.evidenceSources,
          affectedFiles: g.affectedFiles,
          affectedDependencies: g.affectedDependencies,
          confidence: g.confidence,
          findingCount: g.observationIds.length,
        },
      });
      casesUpdated++;
    } else {
      const created = await db.remediationCase.create({
        data: {
          ref: `RC-${shortId()}`,
          tenantId,
          title: titleFor(g),
          repoUrl: g.repoUrl,
          algorithm: g.algorithm,
          purpose: g.purpose,
          correlationKey: g.correlationKey,
          evidenceSources: g.evidenceSources,
          affectedFiles: g.affectedFiles,
          affectedDependencies: g.affectedDependencies,
          confidence: g.confidence,
          findingCount: g.observationIds.length,
          status: "OPEN",
        },
        select: { id: true },
      });
      caseId = created.id;
      casesCreated++;
    }

    // Link observations. The @@unique([caseId, observationId]) makes this safe to
    // re-run; we skip duplicates rather than erroring.
    for (const obsId of g.observationIds) {
      const link = await db.remediationCaseFinding.findUnique({
        where: { caseId_observationId: { caseId, observationId: obsId } },
        select: { id: true },
      });
      if (link) continue;
      const obs = observations.find(o => o.id === obsId);
      await db.remediationCaseFinding.create({
        data: { caseId, observationId: obsId, sensorType: obs?.sensorType ?? "UNKNOWN" },
      });
      findingsLinked++;
    }
  }

  return {
    casesCreated,
    casesUpdated,
    findingsLinked,
    observationsConsidered: observations.length,
    groupsFormed: groups.length,
  };
}
