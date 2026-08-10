import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function GET() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tests = await db.controlTest.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      control: {
        select: {
          id: true, ref: true, title: true, domain: true,
          risks: { include: { risk: { select: { id: true, title: true, residualRating: true } } } },
        },
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ tests });
}

export async function POST(req: NextRequest) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { controlId, title, testMethod, testerId, scheduledAt } = await req.json();
  if (!controlId) return NextResponse.json({ error: "controlId required" }, { status: 400 });

  const control = await db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId } });
  if (!control) return NextResponse.json({ error: "Control not found" }, { status: 404 });

  const ref = `CT-${Date.now().toString(36).toUpperCase()}`;

  const test = await db.controlTest.create({
    data: {
      ref,
      tenantId: ctx.tenantId,
      controlId,
      title: title || `Test: ${control.title}`,
      testMethod: testMethod || null,
      testerId: testerId || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: "PLANNED",
    },
    include: {
      control: {
        select: {
          id: true, ref: true, title: true, domain: true,
          risks: { include: { risk: { select: { id: true, title: true, residualRating: true } } } },
        },
      },
    },
  });

  // Update control's nextTestDue
  if (scheduledAt) {
    await db.control.update({ where: { id: controlId }, data: { nextTestDue: new Date(scheduledAt) } });
  }

  return NextResponse.json({ test }, { status: 201 });
}
