/**
 * VERIQAS Job Poller — standalone worker process.
 *
 * Polls the database for QUEUED scan jobs, claims them atomically,
 * and executes them using the Engine Registry.
 *
 * Run via:  npx tsx src/workers/job-poller.ts
 * Docker:   target: worker in Dockerfile
 *
 * Scale horizontally: run multiple instances — FOR UPDATE SKIP LOCKED
 * ensures each job is claimed by exactly one worker.
 */

import { db } from "@/lib/db/client";
import { executeScanJob } from "@/lib/scanners/worker";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const WORKER_ID       = process.env.WORKER_ID       ?? `veriqas-worker-${process.pid}`;
const CONCURRENCY     = parseInt(process.env.WORKER_CONCURRENCY ?? "2");
const POLL_MS         = parseInt(process.env.POLL_INTERVAL_MS   ?? "5000");
const HEARTBEAT_FILE  = path.join(os.tmpdir(), "worker.heartbeat");

let running      = 0;
let shuttingDown = false;
let jobsProcessed = 0;

// ── Atomic job claim ───────────────────────────────────────────────────────────

async function claimNextJob(): Promise<string | null> {
  const result = await db.$queryRaw<{ id: string }[]>`
    UPDATE senqor."ScanJob"
    SET    status = 'RUNNING',
           "startedAt" = NOW(),
           "workerNode" = ${WORKER_ID}
    WHERE  id = (
      SELECT id FROM senqor."ScanJob"
      WHERE  status = 'QUEUED'
      ORDER  BY "createdAt" ASC
      LIMIT  1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return result[0]?.id ?? null;
}

// ── Poll cycle ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  if (shuttingDown || running >= CONCURRENCY) return;

  try {
    const jobId = await claimNextJob();
    if (!jobId) return;

    running++;
    console.log(`[${WORKER_ID}] claimed job ${jobId} (active: ${running}/${CONCURRENCY})`);

    executeScanJob(jobId)
      .then(result => {
        jobsProcessed++;
        console.log(
          `[${WORKER_ID}] job ${jobId} complete — ` +
          `${result.observationsWritten} observations, ${result.durationMs}ms`
        );
      })
      .catch(err => {
        console.error(`[${WORKER_ID}] job ${jobId} failed:`, err instanceof Error ? err.message : err);
      })
      .finally(() => {
        running--;
        // Immediately poll again if there may be more work
        if (!shuttingDown) poll();
      });

  } catch (err) {
    console.error(`[${WORKER_ID}] poll error:`, err instanceof Error ? err.message : err);
  }
}

// ── Heartbeat ──────────────────────────────────────────────────────────────────
// Writes unix timestamp to /tmp/worker.heartbeat so Docker healthcheck can verify liveness.

function writeHeartbeat(): void {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, String(Math.floor(Date.now() / 1000)));
  } catch {
    // non-fatal
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${WORKER_ID}] received ${signal} — draining ${running} active job(s)...`);

  const deadline = Date.now() + 60_000;
  while (running > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
  }

  if (running > 0) {
    console.warn(`[${WORKER_ID}] timeout waiting for jobs to finish — forcing exit`);
  } else {
    console.log(`[${WORKER_ID}] drained cleanly. Processed ${jobsProcessed} jobs total.`);
  }

  await db.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ── Startup ────────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════╗
║  VERIQAS Worker — Job Poller         ║
╚══════════════════════════════════════╝
  Worker ID   : ${WORKER_ID}
  Concurrency : ${CONCURRENCY}
  Poll interval: ${POLL_MS}ms
  DB           : ${(process.env.DATABASE_URL ?? "").replace(/:([^@]+)@/, ":***@")}
`);

// Immediate poll, then on interval
poll();
const pollTimer      = setInterval(poll, POLL_MS);
const heartbeatTimer = setInterval(writeHeartbeat, 15_000);
writeHeartbeat();

// Keep process alive
pollTimer.unref?.();
heartbeatTimer.unref?.();
// Re-ref so process stays alive
setInterval(() => {}, 1 << 30);
