import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const asset = await db.informationAsset.updateMany({
    where: { id, tenantId: ctx.tenantId },
    data: {
      name: body.name,
      description: body.description ?? null,
      dataCategory: body.dataCategory,
      classificationConfidentiality: body.classificationConfidentiality,
      requiredConfidentialityYears: body.requiredConfidentialityYears ? Number(body.requiredConfidentialityYears) : null,
      retentionYears: body.retentionYears ? Number(body.retentionYears) : null,
      regulatoryRelevance: body.regulatoryRelevance ?? [],
      hndlRisk: body.hndlRisk,
    },
  });

  return NextResponse.json({ updated: asset.count });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.informationAsset.deleteMany({ where: { id, tenantId: ctx.tenantId } });
  return NextResponse.json({ deleted: true });
}
