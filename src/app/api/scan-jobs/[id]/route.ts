import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireAuth, isAuthError } from "@/lib/auth/session";

// GET /api/scan-jobs/:id — poll job status and observations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (isAuthError(ctx)) return ctx;

  const { id } = await params;

  const job = await db.scanJob.findUnique({
    where: { id, tenantId: ctx.tenantId },
    include: {
      sensor: { select: { name: true, sensorType: true } },
      results: {
        select: {
          id: true, algorithm: true, primitiveType: true, quantumClass: true,
          evidenceSource: true, endpoint: true, filePath: true,
          packageName: true, confidence: true, observedAt: true,
        },
        take: 50,
        orderBy: { confidence: "desc" },
      },
    },
  });

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ job });
}
