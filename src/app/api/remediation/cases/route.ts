import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { isV2Enabled } from "@/lib/remediation/feature-flag";
import { buildRemediationCases } from "@/lib/remediation/case-builder";

export const dynamic = "force-dynamic";

// GET /api/remediation/cases — list correlated remediation cases (V2 only).
export async function GET() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isV2Enabled()) {
    return NextResponse.json({ engine: "v1", cases: [] });
  }

  const cases = await db.remediationCase.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    include: { findings: { select: { observationId: true, sensorType: true } } },
    take: 200,
  });
  return NextResponse.json({ engine: "v2", cases });
}

// POST /api/remediation/cases — run correlation and (re)build cases (V2 only).
// Additive and idempotent: never modifies or deletes observations.
export async function POST() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isV2Enabled()) {
    return NextResponse.json(
      { error: "Remediation correlation (V2) is not enabled. Set REMEDIATION_ENGINE=v2 to use it." },
      { status: 501 }
    );
  }

  const result = await buildRemediationCases(ctx.tenantId);
  return NextResponse.json({ engine: "v2", ...result }, { status: 200 });
}
