import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// GET /api/remediation — list jobs for tenant
export async function GET(req: NextRequest) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const observationId = searchParams.get("observationId");

  const jobs = observationId
    ? await db.$queryRawUnsafe<Record<string, unknown>[]>(`
        SELECT rj.*, u.name as "requestedByName"
        FROM senqor."RemediationJob" rj
        LEFT JOIN senqor."User" u ON u.id = rj."requestedById"
        WHERE rj."tenantId" = $1 AND rj."observationId" = $2
        ORDER BY rj."createdAt" DESC LIMIT 50
      `, ctx.tenantId, observationId)
    : await db.$queryRawUnsafe<Record<string, unknown>[]>(`
        SELECT rj.*, u.name as "requestedByName"
        FROM senqor."RemediationJob" rj
        LEFT JOIN senqor."User" u ON u.id = rj."requestedById"
        WHERE rj."tenantId" = $1
        ORDER BY rj."createdAt" DESC LIMIT 50
      `, ctx.tenantId);

  return NextResponse.json(jobs);
}

// POST /api/remediation — create a new job
export async function POST(req: NextRequest) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId || !ctx?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { observationId } = body;
  if (!observationId) return NextResponse.json({ error: "observationId required" }, { status: 400 });

  // Fetch the observation
  const obs = await db.cryptoObservation.findFirst({
    where: { id: observationId, tenantId: ctx.tenantId },
    include: { scanJob: { include: { sensor: true } } },
  });

  if (!obs) return NextResponse.json({ error: "Observation not found" }, { status: 404 });
  if (!obs.filePath) return NextResponse.json({ error: "Observation has no file path — cannot remediate" }, { status: 400 });
  if (!obs.scanJob?.targets?.[0]) return NextResponse.json({ error: "No repo URL on scan job" }, { status: 400 });

  // Check no existing active job for this observation
  const existing = await db.$queryRawUnsafe<{ id: string }[]>(`
    SELECT id FROM senqor."RemediationJob"
    WHERE "observationId" = $1 AND status NOT IN ('REJECTED', 'FAILED')
    LIMIT 1
  `, observationId);
  if (existing.length > 0) {
    return NextResponse.json({ error: "A remediation job already exists for this observation", jobId: existing[0].id }, { status: 409 });
  }

  const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ref = `REM-${Date.now().toString(36).toUpperCase().slice(-8)}`;

  await db.$executeRawUnsafe(`
    INSERT INTO senqor."RemediationJob"
      (id, ref, "tenantId", "observationId", "requestedById", "repoUrl", "filePath", algorithm, status, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', NOW(), NOW())
  `, id, ref, ctx.tenantId, observationId, ctx.userId,
     obs.scanJob.targets[0], obs.filePath, obs.algorithm ?? "UNKNOWN");

  return NextResponse.json({ id, ref, status: "PENDING" }, { status: 201 });
}
