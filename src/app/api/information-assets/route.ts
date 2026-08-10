import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function GET() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assets = await db.informationAsset.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ hndlRisk: "asc" }, { name: "asc" }],
    include: { businessServices: { include: { businessService: { select: { name: true } } } } },
  });

  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const ref = `IA-${Date.now().toString(36).toUpperCase()}`;

  const asset = await db.informationAsset.create({
    data: {
      ref,
      tenantId: ctx.tenantId,
      name: body.name,
      description: body.description ?? null,
      dataCategory: body.dataCategory ?? "APPLICATION_DATA",
      classificationConfidentiality: body.classificationConfidentiality ?? "CONFIDENTIAL",
      classificationIntegrity: body.classificationIntegrity ?? "HIGH",
      classificationAvailability: body.classificationAvailability ?? "HIGH",
      requiredConfidentialityYears: body.requiredConfidentialityYears ? Number(body.requiredConfidentialityYears) : null,
      retentionYears: body.retentionYears ? Number(body.retentionYears) : null,
      regulatoryRelevance: body.regulatoryRelevance ?? [],
      jurisdictions: body.jurisdictions ?? [],
      hndlRisk: body.hndlRisk ?? "UNKNOWN",
    },
  });

  return NextResponse.json({ asset }, { status: 201 });
}
