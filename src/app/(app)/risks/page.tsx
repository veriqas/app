import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { RisksClient } from "./client";


export default async function RisksPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const [dbRisks, users] = await Promise.all([
    db.risk.findMany({
      where: { tenantId, isActive: true },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        businessServices: { include: { businessService: { select: { name: true } } }, take: 1 },
      },
      orderBy: [{ residualRating: "asc" }, { priority: "desc" }],
      take: 100,
    }),
    db.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const risks = dbRisks.map((r) => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    riskType: r.riskType,
    residualRating: r.residualRating,
    status: r.status,
    businessService: r.businessServices[0]?.businessService.name ?? null,
    owner: r.owner ? { id: r.owner.id, name: r.owner.name ?? r.owner.email, email: r.owner.email } : null,
    targetDate: r.targetDate ? r.targetDate.toISOString() : null,
    reviewDate: r.reviewDate ? r.reviewDate.toISOString() : null,
  }));

  return (
    <RisksPageShell
      risks={risks}
      users={users.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email }))}
    />
  );
}

function RisksPageShell({
  risks,
  users,
}: {
  risks: Parameters<typeof RisksClient>[0]["risks"];
  users: Parameters<typeof RisksClient>[0]["users"];
}) {
  const critical = risks.filter((r) => r.residualRating === "CRITICAL").length;
  const high = risks.filter((r) => r.residualRating === "HIGH").length;
  const medium = risks.filter((r) => r.residualRating === "MEDIUM").length;

  return (
    <PageShell
      title="Quantum Risk Register"
      breadcrumbs={[{ label: "Risk" }, { label: "Quantum Risks" }]}
      actions={
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          New Risk
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-3 text-sm">
        <span className="text-slate-500">{risks.length} risks</span>
        <span className="text-slate-300">·</span>
        <span className="font-medium text-red-600">{critical} Critical</span>
        <span className="text-slate-300">·</span>
        <span className="font-medium text-orange-600">{high} High</span>
        <span className="text-slate-300">·</span>
        <span className="font-medium text-amber-600">{medium} Medium</span>
      </div>

      <RisksClient risks={risks} users={users} />
    </PageShell>
  );
}
