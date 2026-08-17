import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { isV2Enabled } from "@/lib/remediation/feature-flag";
import { RebuildCasesButton } from "@/components/remediation/rebuild-cases-button";
import { CaseLog } from "@/components/remediation/case-log";
import { deriveSeverity, deriveAction, type CaseRow, type FilterKey, type SortKey } from "@/components/remediation/case-state";
import { Layers, FileWarning, ShieldCheck, Wrench, AlertOctagon, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RemediationCenterPage({ searchParams }: { searchParams: Promise<{ f?: string; sort?: string }> }) {
  const sp = await searchParams;
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  if (!isV2Enabled()) {
    return (
      <PageShell title="Remediation Center" breadcrumbs={[{ label: "Governance" }, { label: "Remediation Center" }]}>
        <div className="max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
          <div className="flex items-start gap-3">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Remediation engine (V2) is not enabled</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-700">
                The Remediation Center correlates scanner findings into cases, applies the deterministic strategy
                policy, runs the staged AI remediation loop and proves fixes with independent verification. Set{" "}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[12px]">REMEDIATION_ENGINE=v2</code> to enable it.
              </p>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const cases = await db.remediationCase.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      findings: { select: { sensorType: true, observation: { select: { quantumClass: true, primitiveType: true } } } },
      attempts: {
        orderBy: { attemptNumber: "asc" },
        select: { status: true, strategy: true, strategyPolicyVersion: true, policyJson: true, _count: { select: { changes: true } } },
      },
      verificationRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      actionLinks: {
        where: { action: { status: { notIn: ["COMPLETED", "CLOSED"] } } },
        select: { action: { select: { assignee: { select: { name: true, email: true } } } } },
        take: 1,
      },
    },
    take: 200,
  });

  const rows: CaseRow[] = cases.map(c => {
    const latest = c.attempts[c.attempts.length - 1];
    const blocked = c.attempts.some(a => a.status === "OUT_OF_POLICY");
    return {
      id: c.id,
      ref: c.ref,
      algorithm: c.algorithm,
      purpose: c.purpose,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      confidence: c.confidence,
      findingCount: c.findingCount,
      affectedFileCount: c.affectedFiles.length,
      scanners: Array.from(new Set(c.findings.map(f => f.sensorType))),
      quantumClass: String(c.findings.find(f => f.observation?.quantumClass)?.observation?.quantumClass ?? "UNKNOWN"),
      primitiveType: (c.findings.find(f => f.observation?.primitiveType)?.observation?.primitiveType ?? null) as string | null,
      caseStatus: c.status,
      aiStrategy: latest?.strategy ?? null,
      policyVersion: latest?.strategyPolicyVersion ?? null,
      // "Not applied" is stated plainly rather than assumed to be approval.
      policyState: blocked ? "BLOCKED" : latest?.policyJson ? "APPROVED" : "NOT_APPLIED",
      verdict: c.verificationRuns[0]?.status ?? null,
      attemptCount: c.attempts.length,
      hasPatch: c.attempts.some(a => a._count.changes > 0),
      attemptStatus: latest?.status ?? null,
      assignedTo: c.actionLinks[0]?.action.assignee?.name ?? c.actionLinks[0]?.action.assignee?.email ?? null,
    };
  });

  // Summary computed from the rows actually present — never a fixed figure.
  const sev = (r: CaseRow) => deriveSeverity(r.quantumClass, r.primitiveType);
  const summary = [
    { label: "Active cases",     value: rows.length,                                                            icon: Layers,       color: "#0C1524" },
    { label: "Critical",         value: rows.filter(r => sev(r) === "CRITICAL").length,                          icon: AlertOctagon, color: "#B91C1C" },
    { label: "High",             value: rows.filter(r => sev(r) === "HIGH").length,                              icon: AlertOctagon, color: "#C2410C" },
    { label: "Awaiting review",  value: rows.filter(r => deriveAction(r).kind.startsWith("REVIEW") || deriveAction(r).kind === "INVESTIGATE").length, icon: Wrench, color: "#B45309" },
    { label: "Policy blocked",   value: rows.filter(r => r.policyState === "BLOCKED").length,                    icon: Lock,         color: "#4338CA" },
    { label: "Verified",         value: rows.filter(r => r.verdict === "VERIFIED" || r.verdict === "VERIFIED_WITH_WARNINGS").length, icon: ShieldCheck, color: "#15803D" },
  ];

  return (
    <PageShell
      title="Remediation Center"
      breadcrumbs={[{ label: "Governance" }, { label: "Remediation Center" }]}
      actions={<RebuildCasesButton />}
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {summary.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl bg-white p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" style={{ color }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold tabular-nums" style={{ color: "#0C1524" }}>{value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
          <Layers className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-[15px] font-semibold text-slate-700">No remediation cases</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            VERIQAS will create a remediation case when scanner evidence identifies a correlated cryptographic
            issue. Run a discovery scan, or rebuild cases from the observations already collected.
          </p>
          <div className="mt-5 flex justify-center"><RebuildCasesButton /></div>
        </div>
      ) : (
        <>
          <p className="mb-4 text-[12px] uppercase tracking-wider text-slate-400">
            AI proposes · Policy constrains · Scanners prove · Human approves
          </p>
          <CaseLog
            rows={rows}
            initialFilters={(sp.f ?? "").split(",").filter(Boolean) as FilterKey[]}
            initialSort={(sp.sort as SortKey) || "SEVERITY"}
          />
        </>
      )}
    </PageShell>
  );
}
