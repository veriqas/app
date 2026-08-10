import { PageShell } from "@/components/layout/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/utils";
import { Filter, Plus, FileText, CheckCircle, AlertOctagon, Clock } from "lucide-react";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";

function evidenceStateBadge(state: string) {
  const map: Record<string, string> = {
    VERIFIED: "verified", PENDING_VERIFICATION: "pending",
    EXPIRED: "expired", REJECTED: "rejected", MISSING: "missing",
  };
  const labels: Record<string, string> = {
    VERIFIED: "Verified", PENDING_VERIFICATION: "Pending",
    EXPIRED: "Expired", REJECTED: "Rejected", MISSING: "Missing",
  };
  const v = map[state] ?? "default";
  return (
    <Badge variant={v as "verified" | "pending" | "expired" | "rejected" | "missing"}>
      {labels[state] ?? state}
    </Badge>
  );
}

export default async function EvidencePage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const evidence = await db.evidence.findMany({
    where: { tenantId, isLatest: true },
    orderBy: [{ verificationState: "asc" }, { collectedAt: "desc" }],
    take: 200,
  });

  const verified = evidence.filter((e) => e.verificationState === "VERIFIED").length;
  const pending  = evidence.filter((e) => e.verificationState === "PENDING_VERIFICATION").length;
  const missing  = evidence.filter((e) => e.verificationState === "MISSING").length;
  const expired  = evidence.filter((e) => e.verificationState === "EXPIRED").length;

  return (
    <PageShell
      title="Evidence"
      breadcrumbs={[{ label: "Governance" }, { label: "Evidence" }]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Filter className="h-3.5 w-3.5" /> Filter</Button>
          <Button size="sm"><Plus className="h-3.5 w-3.5" /> Upload Evidence</Button>
        </div>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Verified" value={verified} sub="evidence records" variant="low" icon={CheckCircle} />
        <StatCard label="Pending" value={pending} sub="awaiting verification" variant="medium" icon={Clock} />
        <StatCard label="Missing" value={missing} sub="not yet collected" variant="critical" icon={AlertOctagon} />
        <StatCard label="Expired" value={expired} sub="need renewal" variant="high" icon={FileText} />
      </div>

      <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <TableHead>Ref</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evidence.map((e) => (
              <TableRow key={e.id}>
                <TableCell><span className="font-mono text-[11px] text-slate-400">{e.ref}</span></TableCell>
                <TableCell>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[220px] truncate block">{e.title}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="default" className="text-[10px]">{e.evidenceType.replace(/_/g, " ")}</Badge>
                </TableCell>
                <TableCell><span className="text-xs text-slate-500">{e.sourceSystem ?? "—"}</span></TableCell>
                <TableCell>
                  <Badge variant={e.collectionMethod === "AUTOMATED" ? "info" : "default"} className="text-[10px]">
                    {e.collectionMethod.charAt(0) + e.collectionMethod.slice(1).toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell>{evidenceStateBadge(e.verificationState)}</TableCell>
                <TableCell>
                  <span className="text-xs text-slate-400">{formatDate(e.collectedAt)}</span>
                </TableCell>
                <TableCell>
                  <span className={`text-xs ${e.expiresAt && e.expiresAt < new Date() ? "text-red-600 font-medium" : "text-slate-400"}`}>
                    {e.expiresAt ? formatDate(e.expiresAt) : "—"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {evidence.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-slate-400">No evidence records yet</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span className="text-xs text-slate-400">Showing {evidence.length} evidence record{evidence.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </PageShell>
  );
}
