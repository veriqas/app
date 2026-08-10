import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

const REVIEW_DAYS: Record<string, number> = {
  CRITICAL: 90, HIGH: 90, MEDIUM: 180, LOW: 365,
};

export async function POST() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminUser = await db.user.findFirst({
    where: { tenantId: ctx.tenantId, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const risks = await db.risk.findMany({
    where: { tenantId: ctx.tenantId, isActive: true, ownerId: null },
  });

  let patched = 0;
  for (const r of risks) {
    const days = REVIEW_DAYS[r.residualRating] ?? 180;
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() + days);

    await db.risk.update({
      where: { id: r.id },
      data: {
        ownerId: adminUser?.id ?? null,
        reviewDate: r.reviewDate ?? reviewDate,
      },
    });
    patched++;
  }

  return NextResponse.json({ patched });
}
