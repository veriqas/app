import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { isV2Enabled } from "@/lib/remediation/feature-flag";
import { formatDate } from "@/lib/utils";
import { RebuildCasesButton } from "@/components/remediation/rebuild-cases-button";
import { Wrench, ChevronRight, Layers, ShieldCheck, GitBranch, FileWarning } from "lucide-react";

export const dynamic = "force-dynamic";

const CASE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:        { label: "Open",         color: "#6B7280", bg: "#F3F4F6" },
  PLANNED:     { label: "Planned",      color: "#2563EB", bg: "#DBEAFE" },
  IN_PROGRESS: { label: "In Progress",  color: "#D97706", bg: "#FEF3C7" },
  VERIFIED:    { label: "Verified",     color: "#16A34A", bg: "#DCFCE7" },
  FAILED:      { label: "Failed",       color: "#DC2626", bg: "#FEE2E2" },
  DISMISSED:   { label: "Dismissed",    color: "#8A95A3", bg: "#F5F5F7" },
};

function confidenceMeta(c: number) {
  if (c >= 80) return { label: "High", color: "#16A34A" };
  if (c >= 50) return { label: "Medium", color: "#D97706" };
  return { label: "Low", color: "#DC2626" };
}

export default async function RemediationCenterPage() {
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
                The Remediation Center correlates scanner findings into cases, runs the staged AI remediation
                loop, and proves fixes with independent verification. Set{" "}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[12px]">REMEDIATION_ENGINE=v2</code>{" "}
                to enable it. The default per-observation remediation flow remains available from Observations.
              </p>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const cases = await db.remediationCase.findMany({
    where: { tenantId },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    include: {
      findings: { select: { sensorType: true } },
      _count: { select: { attempts: true, verificationRuns: true } },
    },
    take: 200,
  });

  const counts = {
    total: cases.length,
    verified: cases.filter(c => c.status === "VERIFIED").length,
    inProgress: cases.filter(c => c.status === "IN_PROGRESS" || c.status === "PLANNED").length,
    open: cases.filter(c => c.status === "OPEN").length,
    findings: cases.reduce((s, c) => s + c.findingCount, 0),
  };

  const stats = [
    { label: "Cases", value: counts.total, icon: Layers, color: "#0C1524" },
    { label: "Findings correlated", value: counts.findings, icon: GitBranch, color: "#f8781e" },
    { label: "In progress", value: counts.inProgress, icon: Wrench, color: "#D97706" },
    { label: "Verified", value: counts.verified, icon: ShieldCheck, color: "#16A34A" },
  ];

  return (
    <PageShell
      title="Remediation Center"
      breadcrumbs={[{ label: "Governance" }, { label: "Remediation Center" }]}
      actions={<RebuildCasesButton />}
    >
      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl bg-white p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold" style={{ color: "#0C1524" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Intro */}
      <div className="mb-5 rounded-2xl bg-white px-5 py-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
        <p className="text-sm leading-relaxed text-slate-600">
          Each case aggregates the scanner findings that share a common root cause. Open a case to run the staged
          AI remediation loop and review the <span className="font-semibold text-slate-700">staged audit trail</span> and{" "}
          <span className="font-semibold text-slate-700">before / after fingerprint comparison</span> that independent
          scanners produce to prove the fix.
        </p>
      </div>

      {/* Case list */}
      {cases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Layers className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No remediation cases yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Correlation groups active observations into cases by repository, file, algorithm and purpose.
            Rebuild cases to generate them from the current observations.
          </p>
          <div className="mt-4 flex justify-center">
            <RebuildCasesButton />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map(c => {
            const meta = CASE_STATUS[c.status] ?? CASE_STATUS.OPEN;
            const conf = confidenceMeta(c.confidence);
            const sensors = Array.from(new Set(c.findings.map(f => f.sensorType)));
            return (
              <Link
                key={c.id}
                href={`/remediation/cases/${c.id}`}
                className="block rounded-2xl bg-white p-5 transition-shadow hover:shadow-md"
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-mono text-slate-400">{c.ref}</code>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ color: meta.color, background: meta.bg }}>
                        {meta.label}
                      </span>
                      {c.algorithm && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{ color: "#f8781e", background: "rgba(248,120,30,0.08)" }}>
                          {c.algorithm}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 truncate font-semibold text-slate-800" style={{ fontSize: "15px" }}>
                      {c.title}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>{c.findingCount} finding{c.findingCount === 1 ? "" : "s"}</span>
                      {c._count.attempts > 0 && <span>{c._count.attempts} AI attempt{c._count.attempts === 1 ? "" : "s"}</span>}
                      {c._count.verificationRuns > 0 && <span>{c._count.verificationRuns} verification{c._count.verificationRuns === 1 ? "" : "s"}</span>}
                      {c.repoUrl && <span className="truncate">{c.repoUrl}</span>}
                      <span>Created {formatDate(c.createdAt)}</span>
                    </div>
                    {sensors.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sensors.map(s => (
                          <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Confidence</p>
                      <p className="text-sm font-bold" style={{ color: conf.color }}>{c.confidence}%</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
