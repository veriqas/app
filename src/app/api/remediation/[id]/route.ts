import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// GET /api/remediation/[id]
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`
    SELECT rj.*, u.name as "requestedByName"
    FROM senqor."RemediationJob" rj
    LEFT JOIN senqor."User" u ON u.id = rj."requestedById"
    WHERE rj.id = $1 AND rj."tenantId" = $2
    LIMIT 1
  `, id, ctx.tenantId);

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// PATCH /api/remediation/[id] — approve / reject / run
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId || !ctx?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { action } = body; // "run" | "approve" | "reject"

  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`
    SELECT * FROM senqor."RemediationJob" WHERE id = $1 AND "tenantId" = $2 LIMIT 1
  `, id, ctx.tenantId);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "run") {
    await db.$executeRawUnsafe(`
      UPDATE senqor."RemediationJob" SET status = 'RUNNING', "updatedAt" = NOW() WHERE id = $1
    `, id);
    // Fire worker async — don't await
    fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:4000"}/api/remediation/${id}/run`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_SECRET ?? "veriqas-internal" },
    }).catch(() => null);
    return NextResponse.json({ status: "RUNNING" });
  }

  if (action === "approve") {
    await db.$executeRawUnsafe(`
      UPDATE senqor."RemediationJob"
      SET status = 'APPROVED', "reviewedById" = $2, "reviewedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = $1
    `, id, ctx.userId);
    return NextResponse.json({ status: "APPROVED" });
  }

  if (action === "reject") {
    await db.$executeRawUnsafe(`
      UPDATE senqor."RemediationJob"
      SET status = 'REJECTED', "reviewedById" = $2, "reviewedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = $1
    `, id, ctx.userId);
    return NextResponse.json({ status: "REJECTED" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
