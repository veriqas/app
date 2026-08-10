import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { PageShell } from "@/components/layout/page-shell";
import { ControlsClient } from "./client";

export default async function ControlsPage() {
  const ctx = await requireAuth();

  const [controls, users] = await Promise.all([
    db.control.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        risks: {
          include: { risk: { select: { id: true, title: true, residualRating: true } } },
        },
        _count: { select: { tests: true } },
      },
      orderBy: { ref: "asc" },
    }),
    db.user.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = controls.map((c) => ({
    ...c,
    lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
    nextTestDue: c.nextTestDue?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <PageShell
      title="Control Library — SQCF"
      breadcrumbs={[{ label: "Compliance" }, { label: "Controls" }]}
    >
      <ControlsClient controls={serialized} users={users} />
    </PageShell>
  );
}
