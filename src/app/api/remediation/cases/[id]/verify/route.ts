import { NextResponse } from "next/server";
import { getServerSession, requirePermissionApi, isAuthError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { isV2Enabled } from "@/lib/remediation/feature-flag";
import { startVerification, executeVerification } from "@/lib/remediation/verification/verification-service";
import { reapOverdueRuns } from "@/lib/remediation/verification/watchdog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/remediation/cases/[id]/verify — list verification runs for a case (V2).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi("cases:remediate");
  if (isAuthError(guard)) return guard;
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isV2Enabled()) return NextResponse.json({ engine: "v1", runs: [] });

  const { id } = await params;
  await reapOverdueRuns(ctx.tenantId); // opportunistic watchdog

  const runs = await db.verificationRun.findMany({
    where: { caseId: id, tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      scannerResults: true,
      _count: { select: { findings: true } },
    },
    take: 50,
  });
  return NextResponse.json({ engine: "v2", runs });
}

// POST /api/remediation/cases/[id]/verify — start (and run) a verification (V2).
// Idempotent: a non-terminal run for the case is returned rather than duplicated.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi("cases:remediate");
  if (isAuthError(guard)) return guard;
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isV2Enabled()) {
    return NextResponse.json(
      { error: "Remediation verification (V2) is not enabled. Set REMEDIATION_ENGINE=v2 to use it." },
      { status: 501 },
    );
  }

  const { id } = await params;
  const started = await startVerification(id, ctx.tenantId);
  if (started.reused) {
    return NextResponse.json({ engine: "v2", ...started });
  }

  // Execute to a terminal verdict. Evidence-driven; scanner results decide.
  const finalState = await executeVerification(started.run.id);
  return NextResponse.json({ engine: "v2", run: { ...started.run, status: finalState }, reused: false }, { status: 201 });
}
