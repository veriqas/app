import { PageShell } from "@/components/layout/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge, severityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Filter } from "lucide-react";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";

function hndlBadge(risk: string) {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-50 text-red-700 border-red-200",
    HIGH:     "bg-orange-50 text-orange-700 border-orange-200",
    MEDIUM:   "bg-amber-50 text-amber-700 border-amber-200",
    LOW:      "bg-green-50 text-green-700 border-green-200",
    UNKNOWN:  "bg-slate-100 text-slate-600 border-slate-200",
  };
  const label = risk === "NOT_APPLICABLE" ? "N/A" : (risk.charAt(0) + risk.slice(1).toLowerCase());
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${map[risk] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {label}
    </span>
  );
}

export default async function BusinessServicesPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const services = await db.businessService.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: {
      businessOwner: { select: { name: true, email: true } },
      risks: { select: { riskId: true } },
      cryptoAssets: {
        include: { cryptoAsset: { select: { quantumClass: true } } },
      },
    },
    orderBy: [{ criticality: "asc" }, { name: "asc" }],
  });

  const total = services.length;
  const critical = services.filter((s) => s.criticality === "CRITICAL").length;

  return (
    <PageShell
      title="Business Services"
      breadcrumbs={[{ label: "Risk" }, { label: "Business Services" }]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Filter className="h-3.5 w-3.5" /> Filter</Button>
          <Button size="sm"><Plus className="h-3.5 w-3.5" /> Add Service</Button>
        </div>
      }
    >
      <div className="mb-3 text-xs text-slate-500">
        {total} business service{total !== 1 ? "s" : ""} · {critical} critical
      </div>

      <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <TableHead>Ref</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Criticality</TableHead>
              <TableHead>Business Owner</TableHead>
              <TableHead>HNDL Risk</TableHead>
              <TableHead>Crypto Assets</TableHead>
              <TableHead>Vulnerable</TableHead>
              <TableHead>Open Risks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => {
              const vulnCount = s.cryptoAssets.filter((ca) => ca.cryptoAsset.quantumClass === "QUANTUM_VULNERABLE").length;
              const openRisks = s.risks.length;
              return (
                <TableRow key={s.id}>
                  <TableCell><span className="font-mono text-[11px] text-slate-400">{s.ref}</span></TableCell>
                  <TableCell>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{s.name}</span>
                    {s.dataCategories.length > 0 && (
                      <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{s.dataCategories.join(", ")}</p>
                    )}
                  </TableCell>
                  <TableCell>{severityBadge(s.criticality)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500">{s.businessOwner?.name ?? s.businessOwner?.email ?? "—"}</span>
                  </TableCell>
                  <TableCell>{hndlBadge(s.hndlRisk)}</TableCell>
                  <TableCell>
                    <span className="tabular-nums text-sm font-medium text-slate-700 dark:text-slate-300">{s.cryptoAssets.length}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`tabular-nums text-sm font-semibold ${vulnCount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600"}`}>
                      {vulnCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    {openRisks > 0 ? (
                      <Badge variant="high" className="text-[10px]">{openRisks}</Badge>
                    ) : (
                      <Badge variant="low" className="text-[10px]">0</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {services.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-slate-400">
                  No business services yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
