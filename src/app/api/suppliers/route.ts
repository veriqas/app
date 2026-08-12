import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
type Criticality = (typeof CRITICALITIES)[number];

// GET /api/suppliers — list suppliers for the tenant
export async function GET() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suppliers = await db.supplier.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ criticality: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(suppliers);
}

// POST /api/suppliers — create a supplier
export async function POST(req: NextRequest) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });

  const serviceProvided = typeof body.serviceProvided === "string" ? body.serviceProvided.trim() || null : null;
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const criticality: Criticality = CRITICALITIES.includes(body.criticality) ? body.criticality : "MEDIUM";
  const jurisdictions = Array.isArray(body.jurisdictions) ? body.jurisdictions.filter((j: unknown) => typeof j === "string") : [];
  const dataAccess = Array.isArray(body.dataAccess) ? body.dataAccess.filter((d: unknown) => typeof d === "string") : [];

  // Generate a unique, human-readable ref: SUP-XXXXXX
  const ref = `SUP-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  try {
    const supplier = await db.supplier.create({
      data: {
        ref,
        tenantId: ctx.tenantId,
        name,
        serviceProvided,
        description,
        criticality,
        jurisdictions,
        dataAccess,
        status: "ACTIVE",
      },
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create supplier";
    console.error("[suppliers] create failed:", msg);
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 });
  }
}
