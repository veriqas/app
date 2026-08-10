import { PageShell } from "@/components/layout/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge, severityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/utils";
import { Plus, Filter, AlertOctagon, Clock, CheckCircle, User } from "lucide-react";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    OPEN: "bg-blue-50 text-blue-700 border-blue-200",
    ASSIGNED: "bg-purple-50 text-purple-700 border-purple-200",
    IN_PROGRESS: "bg-teal-50 text-teal-700 border-teal-200",
    PENDING_EVIDENCE: "bg-amber-50 text-amber-700 border-amber-200",
    PENDING_VERIFICATION: "bg-orange-50 text-orange-700 border-orange-200",
    COMPLETED: "bg-green-50 text-green-700 border-green-200",
    REJECTED: "bg-red-50 text-red-700 border-red-200",
    OVERDUE: "bg-red-50 text-red-700 border-red-200",
  };
  const labels: Record<string, string> = {
    OPEN: "Open", ASSIGNED: "Assigned", IN_PROGRESS: "In Progress",
    PENDING_EVIDENCE: "Pending Evidence", PENDING_VERIFICATION: "Pending Verification",
    COMPLETED: "Completed", REJECTED: "Rejected", OVERDUE: "Overdue",
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default async function ActionsPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const actions = await db.action.findMany({
    where: { tenantId },
    include: {
      owner: { select: { name: true, email: true } },
      assignee: { select: { name: true, email: true } },
      entities: {
        include: {
          risk: { select: { ref: true } },
          businessService: { select: { name: true } },
        },
        take: 1,
      },
    },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    take: 100,
  });

  const now = new Date();
  const critical = actions.filter((a) => a.priority === "CRITICAL").length;
  const open = actions.filter((a) => ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(a.status)).length;
  const pendingEvidence = actions.filter((a) => a.status === "PENDING_EVIDENCE").length;
  const overdue = actions.filter((a) => a.dueDate && a.dueDate < now && !["COMPLETED", "CANCELLED", "REJECTED"].includes(a.status)).length;

  return (
    <PageShell
      title="Actions"
      breadcrumbs={[{ label: "Governance" }, { label: "Actions" }]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Filter className="h-3.5 w-3.5" /> Filter</Button>
          <Button size="sm"><Plus className="h-3.5 w-3.5" /> New Action</Button>
        </div>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Critical Actions" value={critical} sub="requiring attention" variant="critical" icon={AlertOctagon} />
        <StatCard label="Open Actions" value={open} sub="in progress or open" variant="medium" icon={Clock} />
        <StatCard label="Pending Evidence" value={pendingEvidence} sub="awaiting proof" variant="high" icon={User} />
        <StatCard label="Overdue" value={overdue} sub="past due date" variant="critical" icon={AlertOctagon} />
      </div>

      <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <TableHead>Ref</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Related Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((a) => {
              const isOverdue = a.dueDate && a.dueDate < now && !["COMPLETED", "CANCELLED", "REJECTED"].includes(a.status);
              const riskRef = a.entities[0]?.risk?.ref;
              const bsName = a.entities[0]?.businessService?.name;
              return (
                <TableRow key={a.id}>
                  <TableCell><span className="font-mono text-[11px] text-slate-400">{a.ref}</span></TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[280px]">{a.title}</p>
                    {bsName && <p className="text-[10px] text-slate-400">{bsName}</p>}
                  </TableCell>
                  <TableCell>{severityBadge(a.priority)}</TableCell>
                  <TableCell>{statusBadge(a.status)}</TableCell>
                  <TableCell>
                    <Badge variant="default" className="text-[10px]">
                      {a.actionType.charAt(0) + a.actionType.slice(1).toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{a.owner?.name ?? a.owner?.email ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${isOverdue ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-500"}`}>
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                      {isOverdue && " ⚠"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-[10px] text-slate-400">{riskRef ?? "—"}</span>
                  </TableCell>
                </TableRow>
              );
            })}
            {actions.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-slate-400">
                  No actions yet — actions are created automatically from risks and scan findings
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span className="text-xs text-slate-400">Showing {actions.length} actions</span>
        </div>
      </div>
    </PageShell>
  );
}
