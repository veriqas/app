import { NextRequest, NextResponse } from "next/server";
import { getServerSession, requirePermissionApi, isAuthError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// GET /api/departments — list business units (departments) for the tenant
export async function GET() {
  const guard = await requirePermissionApi("discovery:read");
  if (isAuthError(guard)) return guard;
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const departments = await db.businessUnit.findMany({
    where: { organisation: { tenantId: ctx.tenantId } },
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, businessServices: true } } },
  });
  return NextResponse.json(departments);
}

/**
 * POST /api/departments — create a business unit (department).
 *
 * Permitted to anyone who can run a scan, not only administrators. A scan must
 * name the department it is for, so requiring an administrator round-trip to
 * create one would either block the scan or push people towards leaving work
 * unattributed — the opposite of the intent. Administrators remain the ones who
 * curate the structure, on the Organisation page.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermissionApi("discovery:run");
  if (isAuthError(guard)) return guard;
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
  // A tenant that has not completed organisation setup should still be able to
  // record a department rather than being blocked from scanning.
  const organisationId = org?.id ?? (await db.organisation.create({
    data: { tenantId: ctx.tenantId, name: "Organisation" },
    select: { id: true },
  })).id;

  try {
    const department = await db.businessUnit.create({
      data: {
        organisationId,
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
