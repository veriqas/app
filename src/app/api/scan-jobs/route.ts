import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { checkScanScope } from "@/lib/sensors/scan-scope";
import { getScannerByType } from "@/lib/scanners/registry";
import { executeScanJob } from "@/lib/scanners/worker";

// GET /api/scan-jobs — list jobs for the authenticated tenant
export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const jobs = await db.scanJob.findMany({
    where: { tenantId: ctx.tenantId },
    include: { sensor: { select: { name: true, sensorType: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ jobs });
}

// POST /api/scan-jobs — create and immediately execute a scan job
export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (isAuthError(ctx)) return ctx;

  const body = await req.json().catch(() => null);
  if (!body?.sensorType || !Array.isArray(body.targets) || body.targets.length === 0) {
    return NextResponse.json({ error: "sensorType and targets[] are required" }, { status: 400 });
  }

  const { sensorType, targets } = body as { sensorType: string; targets: string[] };

  const scanner = getScannerByType(sensorType);
  if (!scanner) {
    return NextResponse.json({ error: `Unknown sensorType: ${sensorType}` }, { status: 400 });
  }

  if (scanner.requiresApprovedScope) {
    const scopeCheck = await checkScanScope(ctx.tenantId, sensorType, targets, ctx.userId);
    if (!scopeCheck.allowed) {
      return NextResponse.json({ error: scopeCheck.reason }, { status: 403 });
    }
  }

  let sensor = await db.sensor.findFirst({
    where: { tenantId: ctx.tenantId, sensorType },
  });
  if (!sensor) {
    sensor = await db.sensor.create({
      data: {
        tenantId: ctx.tenantId,
        name: scanner.displayName,
        sensorType,
        description: scanner.description,
        isEnabled: true,
      },
    });
  }

  const ref = `SCN-${Date.now().toString(36).toUpperCase()}`;
  const job = await db.scanJob.create({
    data: {
      ref,
      tenantId: ctx.tenantId,
      sensorId: sensor.id,
      requestedBy: ctx.userId,
      targets,
      status: "PENDING",
    },
  });

  executeScanJob(job.id).catch(err =>
    console.error(`[ScanJob ${job.id}] failed:`, err)
  );

  return NextResponse.json({ jobId: job.id, ref, status: "PENDING" }, { status: 202 });
}
