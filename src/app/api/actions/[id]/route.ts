import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const action = await db.action.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status, dueDate } = body;

  const data: Record<string, unknown> = {};

  if (status !== undefined) {
    data.status = status;
    if (status === "COMPLETED" && !action.completedAt) {
      data.completedAt = new Date();
    } else if (status !== "COMPLETED") {
      data.completedAt = null;
    }
  }

  if (dueDate !== undefined) {
    data.dueDate = dueDate ? new Date(dueDate) : null;
  }

  const updated = await db.action.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ action: updated });
}
