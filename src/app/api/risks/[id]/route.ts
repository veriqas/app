import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const risk = await db.risk.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!risk) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { ownerId, reviewDate, status, residualRating, lastReviewedAt, nextReviewDays } = body;

  const data: Record<string, unknown> = {};

  if (ownerId !== undefined) {
    if (ownerId) {
      const user = await db.user.findFirst({ where: { id: ownerId, tenantId: ctx.tenantId, isActive: true } });
      if (!user) return NextResponse.json({ error: "User not in tenant" }, { status: 400 });
    }
    data.ownerId = ownerId || null;
  }

  if (reviewDate !== undefined) {
    data.reviewDate = reviewDate ? new Date(reviewDate) : null;
  }

  if (status !== undefined) data.status = status;

  if (residualRating !== undefined) {
    data.residualRating = residualRating;
    // recalc residual score from rating
    const scoreMap: Record<string, number> = { CRITICAL: 20, HIGH: 12, MEDIUM: 6, LOW: 3, INFORMATIONAL: 1 };
    data.residualScore = scoreMap[residualRating] ?? risk.residualScore;
  }

  if (lastReviewedAt !== undefined) {
    data.lastReviewedAt = lastReviewedAt ? new Date(lastReviewedAt) : null;
  }

  // nextReviewDays: advance reviewDate from today
  if (nextReviewDays !== undefined && nextReviewDays > 0) {
    const next = new Date();
    next.setDate(next.getDate() + nextReviewDays);
    data.reviewDate = next;
  }

  const updated = await db.risk.update({
    where: { id },
    data,
    include: { owner: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ risk: updated });
}
