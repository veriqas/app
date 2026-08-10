import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { PageShell } from "@/components/layout/page-shell";
import { ControlTestsClient } from "./client";

export default async function Page() {
  const ctx = await requireAuth();

  const [tests, users] = await Promise.all([
    db.controlTest.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        control: {
          select: {
            id: true,
            ref: true,
            title: true,
            domain: true,
            risks: {
              include: { risk: { select: { id: true, title: true, residualRating: true } } },
            },
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.user.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // All controls available for scheduling new tests
  const controls = await db.control.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, ref: true, title: true, domain: true },
    orderBy: { ref: "asc" },
  });

  // Serialize dates to strings for client boundary
  const serialized = tests.map((t) => ({
    ...t,
    scheduledAt: t.scheduledAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <PageShell
      title="Control Tests"
      breadcrumbs={[{ label: "Control Tests" }]}
    >
      <ControlTestsClient tests={serialized} controls={controls} users={users} />
    </PageShell>
  );
}
