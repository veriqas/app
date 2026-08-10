import { PageShell } from "@/components/layout/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge, severityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/utils";
import { Plus, Filter, Building2, AlertOctagon, Clock } from "lucide-react";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";

function qrBadge(rating: string | null) {
  if (!rating || rating === "NOT_ASSESSED") return <Badge variant="not-assessed">Not Assessed</Badge>;
  const map: Record<string, [string, string]> = {
    POOR:      ["bg-red-50 text-red-700 border-red-200",    "Poor"],
    DEVELOPING:["bg-amber-50 text-amber-700 border-amber-200","Developing"],
    ADEQUATE:  ["bg-blue-50 text-blue-700 border-blue-200", "Adequate"],
    GOOD:      ["bg-green-50 text-green-700 border-green-200","Good"],
  };
  const [cls, label] = map[rating] ?? ["bg-slate-100 text-slate-600 border-slate-200", rating];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function planBadge(status: string | null) {
  if (!status || status === "NOT_REQUESTED") return <Badge variant="missing">Not Requested</Badge>;
  const map: Record<string, [string, string]> = {
    REQUESTED: ["bg-blue-50 text-blue-700 border-blue-200",  "Requested"],
    RECEIVED:  ["bg-amber-50 text-amber-700 border-amber-200","Received"],
    REVIEWED:  ["bg-green-50 text-green-700 border-green-200","Reviewed"],
  };
  const [cls, label] = map[status] ?? ["bg-slate-100 text-slate-600 border-slate-200", status];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export default async function SuppliersPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const suppliers = await db.supplier.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: [{ criticality: "asc" }, { name: "asc" }],
  });

  const total = suppliers.length;
  const critical = suppliers.filter((s) => s.criticality === "CRITICAL").length;
  const notAssessed = suppliers.filter((s) => !s.lastAssessedAt).length;
  const noPlan = suppliers.filter((s) => !s.migrationPlanStatus || s.migrationPlanStatus === "NOT_REQUESTED").length;

  return (
    <PageShell
      title="Supplier Register"
      breadcrumbs={[{ label: "Third Parties" }, { label: "Suppliers" }]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Filter className="h-3.5 w-3.5" /> Filter</Button>
          <Button size="sm"><Plus className="h-3.5 w-3.5" /> Add Supplier</Button>
        </div>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Suppliers" value={total} sub="active" icon={Building2} />
        <StatCard label="Critical Suppliers" value={critical} sub="requiring assessment" variant="high" icon={AlertOctagon} />
        <StatCard label="Not Assessed" value={notAssessed} sub="no QRC assessment" variant="critical" icon={Clock} />
        <StatCard label="No Migration Plan" value={noPlan} sub="plan not obtained" variant="high" icon={AlertOctagon} />
      </div>

      <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <TableHead>Ref</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Criticality</TableHead>
              <TableHead>QR Rating</TableHead>
              <TableHead>Migration Plan</TableHead>
              <TableHead>Last Assessed</TableHead>
              <TableHead>Next Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell><span className="font-mono text-[11px] text-slate-400">{s.ref}</span></TableCell>
                <TableCell>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{s.name}</p>
                    {s.dataAccess.length > 0 && (
                      <p className="text-[10px] text-slate-400">{s.dataAccess.join(", ")}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell><span className="text-xs text-slate-500 max-w-[180px] truncate block">{s.serviceProvided ?? "—"}</span></TableCell>
                <TableCell>{severityBadge(s.criticality)}</TableCell>
                <TableCell>{qrBadge(s.quantumReadinessRating)}</TableCell>
                <TableCell>{planBadge(s.migrationPlanStatus)}</TableCell>
                <TableCell>
                  {s.lastAssessedAt ? (
                    <span className="text-xs text-slate-500">{formatDate(s.lastAssessedAt)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertOctagon className="h-3 w-3" />Never</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-slate-400">{s.nextAssessmentAt ? formatDate(s.nextAssessmentAt) : "—"}</span>
                </TableCell>
              </TableRow>
            ))}
            {suppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-slate-400">No suppliers yet</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span className="text-xs text-slate-400">Showing {total} supplier{total !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </PageShell>
  );
}
