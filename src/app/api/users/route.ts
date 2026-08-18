import { NextResponse } from "next/server";
import { getServerSession, requirePermissionApi, isAuthError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function GET() {
  const guard = await requirePermissionApi("admin:users");
  if (isAuthError(guard)) return guard;
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await db.user.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
