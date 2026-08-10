import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { MyWorkClient } from "./client";

export default async function MyWorkPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";
  const userId = ctx?.userId ?? "";

  const today = new Date();
  const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [assignedActions, ownedRisks, allActions, allUsers] = await Promise.all([
    // Actions assigned to current user
    db.action.findMany({
      where: {
        tenantId,
        assigneeId: userId,
        status: { notIn: ["COMPLETED", "CLOSED"] },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    }),
    // Risks owned by current user with upcoming review dates
    db.risk.findMany({
      where: {
        tenantId,
        ownerId: userId,
        reviewDate: { lte: in90Days },
      },
      orderBy: { reviewDate: "asc" },
    }),
    // All open actions for the "assign" panel
    db.action.findMany({
      where: {
        tenantId,
        status: { notIn: ["COMPLETED", "CLOSED"] },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 100,
    }),
    // All tenant users for the user picker
    db.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  type ActionRow = {
    id: string;
    ref: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    dueDate: string | null;
    owner: { id: string; name: string | null; email: string } | null;
    assignee: { id: string; name: string | null; email: string } | null;
  };

  function serializeAction(a: typeof assignedActions[number]): ActionRow {
    return {
      id: a.id,
      ref: a.ref,
      title: a.title,
      description: a.description ?? null,
      priority: a.priority,
      status: a.status,
      dueDate: a.dueDate ? a.dueDate.toISOString() : null,
      owner: a.owner ? { id: a.owner.id, name: a.owner.name, email: a.owner.email } : null,
      assignee: a.assignee ? { id: a.assignee.id, name: a.assignee.name, email: a.assignee.email } : null,
    };
  }

  return (
    <PageShell title="My Work" breadcrumbs={[{ label: "Overview" }, { label: "My Work" }]}>
      <MyWorkClient
        myActions={assignedActions.map(serializeAction)}
        myRisks={ownedRisks.map((r) => ({
          id: r.id,
          ref: r.ref ?? "",
          title: r.title,
          residualRating: r.residualRating ?? "UNKNOWN",
          reviewDate: r.reviewDate ? r.reviewDate.toISOString() : null,
        }))}
        allActions={allActions.map(serializeAction)}
        users={allUsers.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email }))}
        currentUserId={userId}
      />
    </PageShell>
  );
}
