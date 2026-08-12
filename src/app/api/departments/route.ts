import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// GET /api/departments — list business units (departments) for the tenant
export async function GET() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const departments = await db.businessUnit.findMany({
    where: { organisation: { tenantId: ctx.tenantId } },
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, businessServices: true } } },
  });
  return NextResponse.json(departments);
}

// POST /api/departments — create a business unit (department) under the tenant's organisation
export async function POST(req: NextRequest) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Department name is required" }, { status: 400 });

  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const headName = typeof body.headName === "string" ? body.headName.trim() || null : null;

  // Resolve the tenant's organisation (setup creates exactly one).
  const org = await db.organisation.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!org) return NextResponse.json({ error: "No organisation found for tenant" }, { status: 400 });

  try {
    const department = await db.businessUnit.create({
      data: {
        organisationId: org.id,
        name,
        description,
        headName,
      },
    });
    return NextResponse.json(department, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create department";
    console.error("[departments] create failed:", msg);
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}
