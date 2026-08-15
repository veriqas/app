// V1 remediation-job reliability watchdog (production hardening).
//
// A V1 RemediationJob transitions to RUNNING before the async /run worker executes.
// If that worker/request/process dies, the job would otherwise remain RUNNING
// forever. This lazy watchdog transitions such a job to FAILED once its deadline
// has elapsed — atomically, so two concurrent recoveries cannot both win.
//
// It ONLY ever touches jobs in the RUNNING state; REVIEW/APPROVED/REJECTED/FAILED/
// APPLIED/PENDING are never modified. No schema change: the existing updatedAt is
// the last-progress timestamp (set when RUNNING begins and on each /run step).
// This is independent of REMEDIATION_ENGINE and does not affect V2.

import { db } from "@/lib/db/client";

// Generous default: the /run route's own maxDuration is 120s, so 10 minutes with
// no progress unambiguously indicates a dead worker, never a slow-but-live run.
const DEFAULT_TIMEOUT_MS = 600_000;

export function v1TimeoutMs(): number {
  const raw = Number(process.env.REMEDIATION_V1_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Pure predicate: is a job stale (a RUNNING job whose deadline has elapsed)?
 * Any non-RUNNING status is never stale, regardless of age.
 */
export function isStaleRunning(status: string, updatedAt: Date, now: Date, timeoutMs: number): boolean {
  if (status !== "RUNNING") return false;
  return now.getTime() - updatedAt.getTime() > timeoutMs;
}

/**
 * Atomically recover stale RUNNING jobs for a tenant. Returns the number of jobs
 * transitioned to FAILED. Safe to call frequently and concurrently — the
 * status='RUNNING' guard in the WHERE clause makes each recovery a single winner.
 */
export async function reapStaleV1Jobs(tenantId: string, timeoutMs = v1TimeoutMs()): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMs);
  const reason = `Remediation timed out — no result within ${Math.round(timeoutMs / 60000)} minute(s); recovered by watchdog.`;
  const affected = await db.$executeRawUnsafe(
    `UPDATE senqor."RemediationJob"
       SET status = 'FAILED',
           "errorMessage" = COALESCE("errorMessage", $2),
           "updatedAt" = NOW()
     WHERE "tenantId" = $1
       AND status = 'RUNNING'
       AND "updatedAt" < $3`,
    tenantId, reason, cutoff,
  );
  return affected;
}
