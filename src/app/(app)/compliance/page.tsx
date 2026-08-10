import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, alignmentBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";

function StatusIcon({ status }: { status: string }) {
  if (status === "ALIGNED")          return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "NOT_ALIGNED")      return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "NOT_ASSESSED")     return <MinusCircle className="h-4 w-4 text-slate-400" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

export default async function CompliancePage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const alignments = await db.frameworkAlignment.findMany({
    where: { tenantId },
    include: { framework: true },
    orderBy: { calculatedAt: "desc" },
  });

  // Deduplicate: latest alignment per framework
  const seen = new Set<string>();
  const deduped = alignments.filter((a) => {
    if (seen.has(a.frameworkId)) return false;
    seen.add(a.frameworkId);
    return true;
  });

  return (
    <PageShell
      title="Compliance Posture"
      breadcrumbs={[{ label: "Compliance" }, { label: "Compliance Posture" }]}
    >
      {deduped.length === 0 && (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400">
          No framework alignments yet — add frameworks in Admin
        </div>
      )}
      <div className="space-y-4">
        {deduped.map((fa) => {
          const fw = fa.framework;
          const gaps: string[] = (fa.details as { gaps?: string[] } | null)?.gaps ?? [];
          return (
            <Card key={fa.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={fa.status} />
                    <div>
                      <CardTitle>{fw.name}</CardTitle>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {fw.issuingAuthority} · v{fw.version}
                        {fw.milestoneDate && ` · Milestone: ${formatDate(fw.milestoneDate)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {alignmentBadge(fa.status)}
                    <Badge variant="default" className="text-[10px]">Confidence: {fa.confidence}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 md:col-span-5">
                    <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Requirement Alignment</p>
                    <div className="flex h-4 w-full overflow-hidden rounded">
                      <div className="bg-green-500 transition-all" style={{ width: `${fa.alignedPct}%` }} title={`Aligned: ${fa.alignedPct}%`} />
                      <div className="bg-amber-400 transition-all" style={{ width: `${fa.partialPct}%` }} title={`Partial: ${fa.partialPct}%`} />
                      <div className="bg-red-400 transition-all" style={{ width: `${fa.notAlignedPct}%` }} title={`Not aligned: ${fa.notAlignedPct}%`} />
                      <div className="bg-slate-200 dark:bg-slate-700 transition-all" style={{ width: `${fa.notAssessedPct}%` }} title={`Not assessed: ${fa.notAssessedPct}%`} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500" />{fa.alignedPct}% Aligned</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" />{fa.partialPct}% Partial</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-400" />{fa.notAlignedPct}% Not Aligned</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded border border-slate-100 p-2.5 dark:border-slate-800">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Evidence</p>
                        <p className="mt-0.5 text-lg font-semibold text-slate-800 dark:text-slate-200">{Math.round(fa.evidenceCompleteness)}%</p>
                        <p className="text-[10px] text-slate-400">completeness</p>
                      </div>
                      <div className="rounded border border-slate-100 p-2.5 dark:border-slate-800">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Controls</p>
                        <p className="mt-0.5 text-lg font-semibold text-slate-800 dark:text-slate-200">{Math.round(fa.controlImplementation)}%</p>
                        <p className="text-[10px] text-slate-400">implemented</p>
                      </div>
                      <div className="rounded border border-slate-100 p-2.5 dark:border-slate-800">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Open Gaps</p>
                        <p className="mt-0.5 text-lg font-semibold text-red-600 dark:text-red-400">{fa.openGaps}</p>
                        <p className="text-[10px] text-slate-400">requiring action</p>
                      </div>
                      <div className="rounded border border-slate-100 p-2.5 dark:border-slate-800">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Not Assessed</p>
                        <p className="mt-0.5 text-lg font-semibold text-slate-800 dark:text-slate-200">{Math.round(fa.notAssessedPct)}%</p>
                        <p className="text-[10px] text-slate-400">requirements</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-7">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Open Gaps</p>
                    {gaps.length > 0 ? (
                      <div className="space-y-2">
                        {gaps.map((gap, i) => (
                          <div key={i} className="flex items-start gap-2.5 rounded border border-amber-100 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <span className="text-xs text-amber-800 dark:text-amber-300">{gap}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No gaps recorded</p>
                    )}
                    <p className="mt-3 text-[10px] text-slate-400">
                      Last calculated: {formatDate(fa.calculatedAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
