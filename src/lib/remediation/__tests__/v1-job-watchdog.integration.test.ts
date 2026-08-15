// Integration test (local Postgres; no Docker). Verifies the V1 stale-job
// watchdog against real RemediationJob rows.
// Run: npx tsx --test src/lib/remediation/__tests__/v1-job-watchdog.integration.test.ts
import { test, before, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db/client";
import { reapStaleV1Jobs } from "../v1-job-watchdog";

let tenantId = "";
let userId = "";
let obsId = "";
const TIMEOUT = 600_000;

async function makeJob(status: string, updatedMinutesAgo: number, errorMessage: string | null = null): Promise<string> {
  const job = await db.remediationJob.create({
    data: {
      ref: `REM-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      tenant: { connect: { id: tenantId } },
      observation: { connect: { id: obsId } },
      requestedBy: { connect: { id: userId } },
      repoUrl: "https://github.com/acme/x", filePath: "src/a.ts", algorithm: "RSA-2048",
      status, errorMessage,
    },
    select: { id: true },
  });
  // Backdate updatedAt via raw SQL (bypasses Prisma @updatedAt) to simulate age.
  const ts = new Date(Date.now() - updatedMinutesAgo * 60_000).toISOString();
  await db.$executeRawUnsafe(`UPDATE senqor."RemediationJob" SET "updatedAt" = $2 WHERE id = $1`, job.id, ts);
  return job.id;
}

before(async () => {
  const t = await db.tenant.create({ data: { slug: `wd-${Date.now()}`, name: "WD", displayName: "WD" }, select: { id: true } });
  tenantId = t.id;
  const u = await db.user.create({ data: { tenantId, email: `wd-${Date.now()}@x.io`, name: "WD", isActive: true } as never, select: { id: true } });
  userId = u.id;
  const sensor = await db.sensor.create({ data: { tenantId, name: "s", sensorType: "CRYPTOSCAN" } as never, select: { id: true } });
  const sj = await db.scanJob.create({ data: { ref: `SJ-${Date.now()}`, tenantId, sensorId: sensor.id, requestedBy: "t", status: "COMPLETED", targets: ["https://github.com/acme/x"] } as never, select: { id: true } });
  const o = await db.cryptoObservation.create({ data: { ref: `O-${Date.now()}`, tenantId, sensorType: "CRYPTOSCAN", evidenceSource: "STATIC_DETECTION" as never, observedAt: new Date(), algorithm: "RSA-2048", filePath: "src/a.ts", quantumClass: "QUANTUM_VULNERABLE" as never, confidence: 90, scanJobId: sj.id } as never, select: { id: true } });
  obsId = o.id;
});

afterAll(async () => {
  await db.remediationJob.deleteMany({ where: { tenantId } });
  await db.cryptoObservation.deleteMany({ where: { tenantId } });
  await db.scanJob.deleteMany({ where: { tenantId } });
  await db.sensor.deleteMany({ where: { tenantId } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
  await db.$disconnect();
});

test("stale RUNNING → FAILED with a timeout reason; fresh RUNNING and terminal states untouched", async () => {
  const stale = await makeJob("RUNNING", 20);        // 20 min old → stale
  const fresh = await makeJob("RUNNING", 1);          // 1 min old → live
  const review = await makeJob("REVIEW", 60);         // terminal-ish, old
  const approved = await makeJob("APPROVED", 60);
  const rejected = await makeJob("REJECTED", 60);
  const failed = await makeJob("FAILED", 60);

  const count = await reapStaleV1Jobs(tenantId, TIMEOUT);
  assert.equal(count, 1, "only the one stale RUNNING job is recovered");

  const rows = Object.fromEntries((await db.remediationJob.findMany({ where: { tenantId }, select: { id: true, status: true, errorMessage: true } })).map(r => [r.id, r]));
  assert.equal(rows[stale].status, "FAILED");
  assert.match(rows[stale].errorMessage ?? "", /timed out/i);
  assert.equal(rows[fresh].status, "RUNNING", "a live RUNNING job is not recovered");
  assert.equal(rows[review].status, "REVIEW");
  assert.equal(rows[approved].status, "APPROVED");
  assert.equal(rows[rejected].status, "REJECTED");
  assert.equal(rows[failed].status, "FAILED");
});

test("concurrency: a second recovery pass recovers nothing (only one winner)", async () => {
  await makeJob("RUNNING", 20);
  const first = await reapStaleV1Jobs(tenantId, TIMEOUT);
  const second = await reapStaleV1Jobs(tenantId, TIMEOUT);
  assert.equal(first, 1);
  assert.equal(second, 0, "the guarded UPDATE means the second pass finds no RUNNING job to recover");
});

test("a pre-existing error is preserved (not overwritten) on timeout recovery", async () => {
  const withErr = await makeJob("RUNNING", 20, "original scanner error");
  await reapStaleV1Jobs(tenantId, TIMEOUT);
  const row = await db.remediationJob.findUnique({ where: { id: withErr }, select: { status: true, errorMessage: true } });
  assert.equal(row?.status, "FAILED");
  assert.equal(row?.errorMessage, "original scanner error", "COALESCE preserves the original error");
});
