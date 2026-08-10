import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireAuth();
  if (isAuthError(ctx)) return ctx;

  const [running, queued, lastCompleted] = await Promise.all([
    db.scanJob.count({ where: { tenantId: ctx.tenantId, status: "RUNNING" } }),
    db.scanJob.count({ where: { tenantId: ctx.tenantId, status: "QUEUED"  } }),
    db.scanJob.findFirst({
      where:   { tenantId: ctx.tenantId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select:  { completedAt: true, workerNode: true },
    }),
  ]);

  // A job stuck in RUNNING for >10 min likely means the worker crashed
  const stuckCount = await db.scanJob.count({
    where: {
      tenantId: ctx.tenantId,
      status:   "RUNNING",
      startedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
  });

  const workerOnline = running > 0 || (
    lastCompleted?.completedAt != null &&
    lastCompleted.completedAt > new Date(Date.now() - 5 * 60 * 1000)
  );

  return NextResponse.json({
    status:        stuckCount > 0 ? "degraded" : workerOnline ? "online" : "idle",
    running,
    queued,
    stuckCount,
    lastCompletedAt:  lastCompleted?.completedAt?.toISOString() ?? null,
    lastWorkerNode:   lastCompleted?.workerNode ?? null,
  });
}
