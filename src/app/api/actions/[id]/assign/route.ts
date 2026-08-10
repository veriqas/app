import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { assigneeId } = await req.json();

  // Verify the action belongs to this tenant
  const action = await db.action.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify the assignee is in the same tenant
  if (assigneeId) {
    const user = await db.user.findFirst({ where: { id: assigneeId, tenantId: ctx.tenantId, isActive: true } });
    if (!user) return NextResponse.json({ error: "User not found in tenant" }, { status: 400 });
  }

  const updated = await db.action.update({
    where: { id },
    data: {
      assigneeId: assigneeId ?? null,
      status: assigneeId && action.status === "OPEN" ? "ASSIGNED" : action.status,
    },
    include: { assignee: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ action: updated });
}
