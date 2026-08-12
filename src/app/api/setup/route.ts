import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// Default scoring dimensions/weights for a new tenant's active policy.
const DEFAULT_DIMENSIONS = {
  cryptoVisibility: 0.15,
  quantumExposure: 0.20,
  dataLongevity: 0.15,
  migrationPrep: 0.20,
  thirdParty: 0.10,
  governance: 0.10,
  cryptoAgility: 0.10,
} as const;

// GET /api/setup — returns whether initial setup is still needed
export async function GET() {
  const count = await db.tenant.count();
  return NextResponse.json({ needsSetup: count === 0 });
}

// POST /api/setup — creates the first tenant, organisation, admin user,
// a default business unit, and the active scoring policy. Only permitted
// while the platform has zero tenants (first-run only).
export async function POST(req: NextRequest) {
  const existing = await db.tenant.count();
  if (existing > 0) {
    return NextResponse.json({ error: "Platform is already configured" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const orgName = typeof body.orgName === "string" ? body.orgName.trim() : "";
  const adminEmail = typeof body.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";
  const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";

  if (!orgName) return NextResponse.json({ error: "Organisation name is required" }, { status: 400 });
  if (!adminEmail || !adminEmail.includes("@"))
    return NextResponse.json({ error: "A valid admin email is required" }, { status: 400 });
  if (adminPassword.length < 10)
    return NextResponse.json({ error: "Password must be at least 10 characters" }, { status: 400 });

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  try {
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { slug, name: orgName, displayName: orgName },
      });

      const org = await tx.organisation.create({
        data: { tenantId: tenant.id, name: orgName },
      });

      const bu = await tx.businessUnit.create({
        data: { organisationId: org.id, name: "Administration" },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId: bu.id,
          email: adminEmail,
          name: "Administrator",
          passwordHash,
          isActive: true,
        },
      });

      await tx.scoringPolicy.create({
        data: {
          tenantId: tenant.id,
          version: "1.0",
          isActive: true,
          description: "Default scoring policy",
          dimensions: DEFAULT_DIMENSIONS,
        },
      });

      return { tenantId: tenant.id, adminEmail: user.email };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Setup failed";
    console.error("[setup] failed:", msg);
    return NextResponse.json({ error: "Setup failed. Check server logs." }, { status: 500 });
  }
}
