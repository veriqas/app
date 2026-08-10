import { PageShell } from "@/components/layout/page-shell";
import { getPostureSummary } from "@/lib/services/posture.service";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { severityBadge } from "@/components/ui/badge";
import { FileDown, CheckCircle2, XCircle, FileText, BarChart3, Shield, ArrowUpRight } from "lucide-react";

export default async function ExecutiveReportsPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const [posture, riskBreakdown, tenant] = await Promise.all([
    getPostureSummary(tenantId).catch(() => null),
    db.risk.groupBy({
      by: ["riskType", "residualRating"],
      where: { tenantId, isActive: true, status: { not: "CLOSED" } },
      _count: true,
    }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  const score        = posture?.readinessScore ?? 0;
  const scoreChange  = posture?.scoreChange ?? null;
  const rc           = posture?.riskCounts ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const totalRisks   = rc.CRITICAL + rc.HIGH + rc.MEDIUM + rc.LOW;
  const totalObs     = posture?.totalObservations ?? 0;
  const recentScans  = posture?.recentScans ?? [];
  const obsByClass   = posture?.observationsByClass ?? { QUANTUM_VULNERABLE: 0, QUANTUM_REDUCED_SECURITY: 0, QUANTUM_RESILIENT: 0, POST_QUANTUM: 0, HYBRID: 0, UNKNOWN: 0 };
  const topRisks     = posture?.topRisks ?? [];
  const tenantName   = tenant?.name ?? "VERIQAS Client";

  const scoreColor = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  const scoreLabel = score >= 70 ? "LOW EXPOSURE" : score >= 40 ? "HIGH EXPOSURE" : "CRITICAL EXPOSURE";

  return (
    <PageShell
      title="Executive Reports"
      breadcrumbs={[{ label: "Reporting" }, { label: "Executive Reports" }]}
    >
      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.02em" }}>
            Executive Reports
          </h1>
          <p className="mt-1" style={{ fontSize: "12px", color: "#8A95A3" }}>
            {tenantName} · Quantum Risk &amp; Compliance · {formatDate(new Date())}
          </p>
        </div>
        <a
          href="/api/reports/quantum-pdf"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 transition-opacity hover:opacity-80"
          style={{ background: "#0C1524" }}
        >
          <FileDown className="h-4 w-4" style={{ color: "#f8781e" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#FFFFFF" }}>
            Download PDF Report
          </span>
        </a>
      </div>

      {/* â”€â”€ Report preview card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className="mb-6 overflow-hidden rounded-xl"
        style={{ border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
      >
        {/* Dark header band */}
        <div
          className="flex items-center justify-between px-7 py-5"
          style={{ background: "#0C1524" }}
        >
          <div>
            <p style={{ fontSize: "10px", color: "#f8781e", letterSpacing: "2px", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
              VERIQAS · Verified Quantum Assurance &amp; Governance
            </p>
            <p style={{ fontSize: "20px", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em" }}>
              Quantum Cryptographic Risk Report
            </p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
              {tenantName} · {formatDate(new Date())} · CONFIDENTIAL
            </p>
          </div>
          <div className="text-right">
            <p style={{ fontSize: "36px", fontWeight: 900, color: scoreColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {score}
            </p>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>/ 100 readiness</p>
            <p style={{ fontSize: "9px", fontWeight: 700, color: scoreColor, letterSpacing: "1px", marginTop: "4px" }}>
              {scoreLabel}
            </p>
          </div>
        </div>

        {/* KPI strip */}
        <div
          className="grid grid-cols-4"
          style={{ borderBottom: "1px solid #F0F4F8" }}
        >
          {[
            { label: "Open Risks",        value: String(totalRisks),          sub: `${rc.CRITICAL} critical`,    color: "#EF4444" },
            { label: "Critical Risks",    value: String(rc.CRITICAL),         sub: "immediate action",           color: "#EF4444" },
            { label: "Observations",      value: totalObs.toLocaleString(),   sub: "crypto findings",            color: "#F97316" },
            { label: "Scans Completed",   value: String(recentScans.filter(s => s.status === "COMPLETED").length), sub: "recent activity", color: "#10B981" },
          ].map((k, i) => (
            <div
              key={k.label}
              className="px-6 py-4"
              style={{ borderRight: i < 3 ? "1px solid #F0F4F8" : undefined }}
            >
              <p style={{ fontSize: "9px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                {k.label}
              </p>
              <p style={{ fontSize: "22px", fontWeight: 800, color: k.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {k.value}
              </p>
              <p style={{ fontSize: "10px", color: "#8A95A3", marginTop: "3px" }}>{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Body — two columns */}
        <div className="grid grid-cols-2" style={{ background: "#FFFFFF" }}>

          {/* Left: Risk exposure */}
          <div className="px-7 py-6" style={{ borderRight: "1px solid #F0F4F8" }}>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "14px" }}>
              Risk Exposure
            </p>
            {/* Stacked bar */}
            <div className="flex h-2 w-full overflow-hidden rounded-full mb-4" style={{ background: "#F0F4F8" }}>
              {([["CRITICAL","#EF4444"],["HIGH","#F97316"],["MEDIUM","#F59E0B"],["LOW","#10B981"]] as [keyof typeof rc, string][]).map(([k, c]) => (
                <div key={k} style={{ width: `${(rc[k] / (totalRisks || 1)) * 100}%`, background: c }} />
              ))}
            </div>
            <div className="space-y-2.5">
              {([["Critical","#EF4444",rc.CRITICAL],["High","#F97316",rc.HIGH],["Medium","#F59E0B",rc.MEDIUM],["Low","#10B981",rc.LOW]] as [string,string,number][]).map(([label, color, count]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="flex-1" style={{ fontSize: "12px", color: "#4A5568" }}>{label}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                </div>
              ))}
            </div>

            {totalObs > 0 && (
              <>
                <div className="my-5" style={{ borderTop: "1px solid #F0F4F8" }} />
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
                  Observation Breakdown
                </p>
                <div className="space-y-2">
                  {([
                    ["QUANTUM_VULNERABLE", "Quantum Vulnerable", "#EF4444"],
                    ["QUANTUM_REDUCED_SECURITY", "Reduced Security", "#F97316"],
                    ["QUANTUM_RESILIENT", "Resilient", "#10B981"],
                    ["POST_QUANTUM", "Post-Quantum", "#059669"],
                    ["UNKNOWN", "Unclassified", "#CBD3DF"],
                  ] as [keyof typeof obsByClass, string, string][]).filter(([k]) => obsByClass[k] > 0).map(([key, label, color]) => {
                    const count = obsByClass[key];
                    const max = Math.max(1, ...Object.values(obsByClass));
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="flex-1" style={{ fontSize: "11px", color: "#4A5568" }}>{label}</span>
                        <div className="w-20 h-1.5 rounded-full" style={{ background: "#F0F4F8" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${(count / max) * 100}%`, background: color }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums", minWidth: "24px", textAlign: "right" }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Right: Top risks */}
          <div className="px-7 py-6">
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "14px" }}>
              Top Quantum Risks
            </p>
            <div className="space-y-3">
              {topRisks.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{severityBadge(r.residualRating)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate" style={{ fontSize: "12px", fontWeight: 500, color: "#0F1923" }}>{r.title}</p>
                    <p style={{ fontSize: "10px", color: "#8A95A3", fontFamily: "monospace", marginTop: "1px" }}>{r.ref}</p>
                  </div>
                </div>
              ))}
              {topRisks.length === 0 && (
                <p style={{ fontSize: "12px", color: "#8A95A3" }}>No open critical or high risks</p>
              )}
            </div>

            {recentScans.length > 0 && (
              <>
                <div className="my-5" style={{ borderTop: "1px solid #F0F4F8" }} />
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
                  Recent Scan Activity
                </p>
                <div className="space-y-2.5">
                  {recentScans.slice(0, 4).map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {s.status === "COMPLETED"
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "#10B981" }} />
                        : <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#EF4444" }} />
                      }
                      <div className="min-w-0 flex-1">
                        <p className="truncate" style={{ fontSize: "12px", color: "#0F1923", fontWeight: 500 }}>{s.sensorName}</p>
                        <p className="truncate" style={{ fontSize: "10px", color: "#8A95A3" }}>
                          {s.targets.slice(0,1).join(", ")}
                        </p>
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums" }}>
                        {s.resultCount}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer band */}
        <div
          className="flex items-center justify-between px-7 py-3"
          style={{ background: "#F7F9FC", borderTop: "1px solid #F0F4F8" }}
        >
          <p style={{ fontSize: "10px", color: "#8A95A3" }}>
            VERIQAS · {tenantName} · CONFIDENTIAL
          </p>
          <p style={{ fontSize: "10px", color: "#8A95A3" }}>
            {posture?.frameworkAlignments?.map(fw => `${fw.shortName}: ${fw.alignedPct}%`).join("  ·  ")}
          </p>
        </div>
      </div>

      {/* â”€â”€ Other available reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div>
        <p className="mb-3" style={{ fontSize: "11px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Available Reports
        </p>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              icon: FileText,
              title: "Quantum Risk Report",
              desc: "Full executive summary: readiness score, risk register, observations, scan activity. 2 pages, A4 PDF.",
              href: "/api/reports/quantum-pdf",
              badge: "Ready",
              badgeColor: "#10B981",
            },
            {
              icon: BarChart3,
              title: "Board Risk Report",
              desc: "Summarised board-level view of quantum exposure with peer benchmarking.",
              href: null,
              badge: "Coming soon",
              badgeColor: "#8A95A3",
            },
            {
              icon: Shield,
              title: "Compliance Evidence Pack",
              desc: "NCSC PQC, NIST, CNSA 2.0 aligned controls, evidence, and gap analysis.",
              href: null,
              badge: "Coming soon",
              badgeColor: "#8A95A3",
            },
          ].map((r) => (
            <div
              key={r.title}
              className="rounded-xl p-5"
              style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
            >
              <div className="mb-3 flex items-start justify-between">
                <r.icon className="h-5 w-5" style={{ color: "#f8781e" }} />
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.05em", color: r.badgeColor, background: `${r.badgeColor}18` }}
                >
                  {r.badge}
                </span>
              </div>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923", marginBottom: "6px" }}>{r.title}</p>
              <p style={{ fontSize: "11px", color: "#8A95A3", lineHeight: 1.5, marginBottom: "14px" }}>{r.desc}</p>
              {r.href ? (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
                  style={{ fontSize: "12px", fontWeight: 600, color: "#f8781e" }}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download PDF
                </a>
              ) : (
                <span style={{ fontSize: "12px", color: "#CBD3DF" }}>Not yet available</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

