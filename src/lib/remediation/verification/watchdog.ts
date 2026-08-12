// Lazy timeout watchdog. No cron/worker is introduced: overdue runs are reaped
// opportunistically whenever verification state is read or a new run is created.
// This guarantees no VerificationRun can remain non-terminal forever.

import { db } from "@/lib/db/client";
import { isTerminal } from "./verdict";

export interface DeadlineBearing {
  id: string;
  status: string;
  deadlineAt: Date;
}

/** Pure: which runs are past deadline and still non-terminal. */
export function findOverdue<T extends DeadlineBearing>(runs: T[], now: Date = new Date()): T[] {
  return runs.filter(r => !isTerminal(r.status) && r.deadlineAt.getTime() < now.getTime());
}

/**
 * Reap overdue verification runs for a tenant (or globally when omitted),
 * transitioning them to TIMEOUT. Idempotent and safe to call frequently.
 * Returns the number of runs reaped.
 */
export async function reapOverdueRuns(tenantId?: string): Promise<number> {
  const now = new Date();
  const candidates = await db.verificationRun.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      deadlineAt: { lt: now },
      status: { notIn: [
        "VERIFIED", "VERIFIED_WITH_WARNINGS", "FAILED", "REGRESSED",
        "BUILD_FAILED", "TEST_FAILED", "SCAN_FAILED",
        "TIMEOUT", "VERIFICATION_ERROR", "CANCELLED", "NO_BASELINE",
      ] },
    },
    select: { id: true, startedAt: true, createdAt: true },
  });

  for (const r of candidates) {
    const started = r.startedAt ?? r.createdAt;
    await db.verificationRun.update({
      where: { id: r.id },
      data: {
        status: "TIMEOUT",
        verdictReason: "Verification exceeded its deadline and was reaped by the watchdog.",
        finishedAt: now,
        durationMs: now.getTime() - started.getTime(),
      },
    });
  }
  return candidates.length;
}
