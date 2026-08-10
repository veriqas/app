import { PageShell } from "@/components/layout/page-shell";
import { getPostureSummary } from "@/lib/services/posture.service";
import { formatDate, scoreRatingLabel } from "@/lib/utils";
import { alignmentBadge, severityBadge } from "@/components/ui/badge";
import { AlertOctagon, Clock, ArrowUpRight, CheckCircle2, XCircle, ScanSearch } from "lucide-react";
import { ReadinessGauge } from "./readiness-gauge";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export default async function DashboardPage() {
  const ctx = await getServerSession();
  const [posture, tenant] = await Promise.all([
    getPostureSummary(ctx?.tenantId ?? "").catch(() => null),
    ctx?.tenantId
      ? db.tenant.findUnique({ where: { id: ctx.tenantId }, select: { displayName: true, name: true } })
      : null,
  ]);

  const hasData = posture !== null && (posture.totalCryptoAssets > 0 || posture.topRisks.length > 0);

  const score           = posture?.readinessScore ?? 0;
  const scoreChange     = posture?.scoreChange ?? 0;
  const riskCounts      = posture?.riskCounts ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const totalRisks      = riskCounts.CRITICAL + riskCounts.HIGH + riskCounts.MEDIUM + riskCounts.LOW;
  const criticalSup     = posture?.criticalSupplierUnassessedCount ?? 0;
  const totalVulnerable = posture?.quantumVulnerableCount ?? 0;
  const openActions     = posture?.openActionCount ?? 0;
  const criticalActions = posture?.criticalActionCount ?? 0;
  const frameworks      = posture?.frameworkAlignments ?? [];
  const topRisks        = posture?.topRisks ?? [];
  const priorityActions = posture?.priorityActions ?? [];
  const dimensions      = posture?.dimensions ?? [];
  const postQuantum     = posture?.postQuantumCount ?? 0;
  const totalAssets     = posture?.totalCryptoAssets ?? 0;
  const unknownCount    = posture?.unknownClassCount ?? 0;
  const classifiedPct   = totalAssets > 0 ? Math.round((totalAssets - unknownCount) / totalAssets * 100) : 0;
  const recentScans     = posture?.recentScans ?? [];
  const obsByClass      = posture?.observationsByClass ?? { QUANTUM_VULNERABLE: 0, QUANTUM_REDUCED_SECURITY: 0, QUANTUM_RESILIENT: 0, POST_QUANTUM: 0, HYBRID: 0, UNKNOWN: 0 };
  const totalObs        = posture?.totalObservations ?? 0;

  return (
    <PageShell
      title="Executive Posture"
      breadcrumbs={[{ label: "VERIQAS" }, { label: "Executive Posture" }]}
    >
      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {tenant?.displayName ?? tenant?.name ?? "Your Organisation"}
          </h1>
          <p className="mt-1" style={{ fontSize: "12px", color: "#8A95A3", fontWeight: 400 }}>
            {posture?.lastCalculatedAt
              ? <>Last calculated: {formatDate(posture.lastCalculatedAt)} &nbsp;·&nbsp; Discovery confidence: <span style={{ fontWeight: 600, color: "#4A5568" }}>{posture.confidence}</span></>
              : "Run your first scan to populate this dashboard"}
          </p>
        </div>
        {criticalActions > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
          >
            <AlertOctagon className="h-3.5 w-3.5" style={{ color: "#DC2626" }} />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#DC2626" }}>
              {criticalActions} Critical Actions Required
            </span>
          </div>
        )}
      </div>

      {/* â”€â”€ Empty state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!hasData && (
        <div
          className="mb-8 flex flex-col items-center justify-center gap-5 rounded-2xl py-16 text-center"
          style={{ border: "1.5px dashed #E2E8F0", background: "#FAFBFC" }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "rgba(71,204,98,0.1)" }}>
            <ScanSearch className="h-7 w-7" style={{ color: "#f8781e" }} />
          </div>
          <div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0F1923", marginBottom: "6px" }}>
              No scan data yet
            </p>
            <p style={{ fontSize: "13px", color: "#8A95A3", maxWidth: "380px", lineHeight: 1.6 }}>
              Run a scanner to start discovering cryptographic assets across your environment.
              Results will populate this dashboard automatically.
            </p>
          </div>
          <a
            href="/discovery/scan-jobs"
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#f8781e", boxShadow: "0 1px 4px rgba(71,204,98,0.35)" }}
          >
            <ScanSearch className="h-4 w-4" />
            Go to Scanners
          </a>
        </div>
      )}

      {/* â”€â”€ KPI strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Readiness Score"
          value={hasData ? String(score) : "—"}
          unit={hasData ? "/100" : ""}
          trend={hasData && scoreChange !== 0 ? (scoreChange >= 0 ? `▲ +${scoreChange} vs prior period` : `▼ ${scoreChange} vs prior period`) : undefined}
          trendUp={scoreChange >= 0}
          accent="#f8781e"
        />
        <KpiCard label="Quantum Vulnerable" value={hasData ? totalVulnerable.toLocaleString() : "—"} unit="" sub={hasData ? "crypto assets" : "no data"} accent="#EF4444" />
        <KpiCard label="Open Risks"          value={hasData ? String(totalRisks) : "—"}    unit="" sub={hasData ? `${riskCounts.CRITICAL} critical` : "no data"} accent="#F97316" />
        <KpiCard label="Open Actions"        value={hasData ? String(openActions) : "—"}   unit="" sub={hasData ? `${criticalActions} overdue` : "no data"}  accent="#F59E0B" />
        <KpiCard label="Unassessed Suppliers" value={hasData ? String(criticalSup) : "—"}  unit="" sub={hasData ? "critical tier" : "no data"}                  accent="#F97316" />
        <KpiCard label="Post-Quantum Ready"  value={hasData ? String(postQuantum) : "—"}   unit="" sub={hasData ? `${classifiedPct}% classified` : "no data"} accent="#10B981" />
      </div>

      {/* â”€â”€ Main 3-col â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-5 grid grid-cols-12 gap-5">

        {/* Readiness Score */}
        <div
          className="col-span-12 md:col-span-4 flex flex-col rounded-xl overflow-hidden"
          style={{ background: "#0C1524", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <SectionLabel light>Quantum Readiness Score</SectionLabel>
          <div className="flex flex-1 items-center justify-center px-5 py-5">
            <ReadinessGauge score={score} change={scoreChange} rating={scoreRatingLabel(score)} />
          </div>
          {dimensions.length > 0 ? (
            <div className="grid grid-cols-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {dimensions.map((d, i) => (
                <div
                  key={d.name}
                  className="px-4 py-3"
                  style={{
                    borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.07)" : undefined,
                    borderTop: i >= 2 ? "1px solid rgba(255,255,255,0.07)" : undefined,
                  }}
                >
                  <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.10em", color: "rgba(141,160,184,0.6)", textTransform: "uppercase" }}>
                    {d.name}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div
                        className="h-[3px] rounded-full"
                        style={{ width: `${Math.max(d.score, 2)}%`, background: "#f8781e" }}
                      />
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#E2E8F0", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(d.score)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "16px 20px" }}>
              <p style={{ fontSize: "12px", color: "rgba(141,160,184,0.5)", textAlign: "center" }}>
                Dimensions calculated after first scan
              </p>
            </div>
          )}
        </div>

        {/* Risk Exposure */}
        <SurfaceCard className="col-span-12 md:col-span-4">
          <SectionLabel>Risk Exposure</SectionLabel>
          {totalRisks > 0 ? (
            <div className="px-5 pb-5 pt-4">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "#F5F5F7" }}>
                {(
                  [
                    { key: "CRITICAL", color: "#EF4444" },
                    { key: "HIGH",     color: "#F97316" },
                    { key: "MEDIUM",   color: "#F59E0B" },
                    { key: "LOW",      color: "#10B981" },
                  ] as { key: keyof typeof riskCounts; color: string }[]
                ).map(({ key, color }) => (
                  <div
                    key={key}
                    style={{ width: `${(riskCounts[key] / totalRisks) * 100}%`, background: color }}
                    title={`${key}: ${riskCounts[key]}`}
                  />
                ))}
              </div>
              <p className="mt-2" style={{ fontSize: "11px", color: "#8A95A3" }}>{totalRisks} open quantum risks</p>
              <div className="mt-5 space-y-3">
                {(
                  [
                    ["Critical", "#EF4444", riskCounts.CRITICAL],
                    ["High",     "#F97316", riskCounts.HIGH],
                    ["Medium",   "#F59E0B", riskCounts.MEDIUM],
                    ["Low",      "#10B981", riskCounts.LOW],
                  ] as [string, string, number][]
                ).map(([label, color, count]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="flex-1" style={{ fontSize: "12px", color: "#4A5568", fontWeight: 500 }}>{label}</span>
                    <div className="w-28 h-1.5 rounded-full" style={{ background: "#F5F5F7" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${(count / totalRisks) * 100}%`, background: color }} />
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums", minWidth: "20px", textAlign: "right" }}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: "#F5F5F7" }}>
                <span style={{ fontSize: "12px", color: "#8A95A3", fontWeight: 500 }}>Open actions</span>
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums" }}>{openActions}</span>
              </div>
            </div>
          ) : (
            <EmptyPanel message="Risks will appear here after scanning" />
          )}
        </SurfaceCard>

        {/* Compliance Alignment */}
        <SurfaceCard className="col-span-12 md:col-span-4">
          <SectionLabel>Compliance Alignment</SectionLabel>
          {frameworks.length > 0 ? (
            <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
              {frameworks.map((fw) => (
                <div key={fw.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#0F1923" }}>{fw.shortName}</span>
                    {alignmentBadge(fw.status)}
                  </div>
                  <div className="h-2 w-full rounded-full" style={{ background: "#F5F5F7" }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${fw.alignedPct}%`,
                        background: fw.alignedPct >= 80 ? "#10B981" : fw.alignedPct >= 50 ? "#F59E0B" : "#EF4444",
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between" style={{ fontSize: "10px", color: "#8A95A3", fontWeight: 500 }}>
                    <span>{fw.alignedPct}% aligned</span>
                    {fw.milestoneDate && <span>Target: {formatDate(fw.milestoneDate)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel message="Add frameworks under Compliance to track alignment" link="/compliance" linkLabel="Go to Compliance" />
          )}
        </SurfaceCard>
      </div>

      {/* â”€â”€ Bottom tables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-12 gap-5">

        {/* Top Risks */}
        <SurfaceCard className="col-span-12 md:col-span-7" noPad>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Top Enterprise Quantum Risks
            </span>
            <a href="/risks" className="flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: "11px", fontWeight: 600, color: "#f8781e" }}>
              View all <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          {topRisks.length === 0 ? (
            <EmptyPanel message="No risks yet — they'll appear here as scan findings are reviewed" link="/risks" linkLabel="Go to Risk Register" />
          ) : (
            <div>
              {topRisks.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
                  style={{ borderBottom: i < topRisks.length - 1 ? "1px solid #F5F5F7" : undefined }}
                >
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "#CBD3DF", fontFamily: "monospace", minWidth: "72px" }}>{r.ref}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate" style={{ fontSize: "13px", fontWeight: 500, color: "#0F1923" }}>{r.title}</p>
                    {r.businessService && (
                      <p className="truncate mt-0.5" style={{ fontSize: "11px", color: "#8A95A3" }}>{r.businessService}</p>
                    )}
                  </div>
                  <div className="shrink-0">{severityBadge(r.residualRating)}</div>
                  <span className="shrink-0 rounded-md px-2 py-0.5" style={{ fontSize: "10px", fontWeight: 600, color: "#4A5568", background: "#F5F5F7", letterSpacing: "0.02em" }}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        {/* Priority Actions */}
        <SurfaceCard className="col-span-12 md:col-span-5" noPad>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Priority Actions
            </span>
            <a href="/actions" className="flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: "11px", fontWeight: 600, color: "#f8781e" }}>
              View all <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          {priorityActions.length === 0 ? (
            <EmptyPanel message="No priority actions open" />
          ) : (
            <div>
              {priorityActions.map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
                  style={{ borderBottom: i < priorityActions.length - 1 ? "1px solid #F5F5F7" : undefined }}
                >
                  <div className="mt-0.5 shrink-0">{severityBadge(a.priority)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate" style={{ fontSize: "13px", fontWeight: 500, color: "#0F1923" }}>{a.title}</p>
                    <p className="mt-0.5 flex items-center gap-1" style={{ fontSize: "11px", color: "#8A95A3" }}>
                      <Clock className="h-3 w-3 shrink-0" />
                      {a.dueDate ? formatDate(a.dueDate) : "No due date"}
                    </p>
                  </div>
                  <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#CBD3DF", flexShrink: 0 }}>{a.ref}</span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* â”€â”€ Discovery Activity (only shown once scans exist) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {(totalObs > 0 || recentScans.length > 0) && (
        <div className="mt-5 grid grid-cols-12 gap-5">
          <SurfaceCard className="col-span-12 md:col-span-4">
            <SectionLabel>Cryptographic Observation Summary</SectionLabel>
            {totalObs > 0 ? (
              <div className="px-5 pb-5 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: "12px", color: "#8A95A3" }}>Total observations</span>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums" }}>{totalObs.toLocaleString()}</span>
                </div>
                <div className="h-[1px]" style={{ background: "#F5F5F7" }} />
                {([
                  ["QUANTUM_VULNERABLE",       "Quantum Vulnerable",   "#EF4444"],
                  ["QUANTUM_REDUCED_SECURITY", "Reduced Security",     "#F97316"],
                  ["QUANTUM_RESILIENT",        "Quantum Resilient",    "#10B981"],
                  ["POST_QUANTUM",             "Post-Quantum",         "#059669"],
                  ["HYBRID",                   "Hybrid",               "#6366F1"],
                  ["UNKNOWN",                  "Unclassified",         "#CBD3DF"],
                ] as [keyof typeof obsByClass, string, string][]).filter(([k]) => obsByClass[k] > 0).map(([key, label, color]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="flex-1" style={{ fontSize: "12px", color: "#4A5568", fontWeight: 500 }}>{label}</span>
                    <div className="w-24 h-1.5 rounded-full" style={{ background: "#F5F5F7" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${(obsByClass[key] / totalObs) * 100}%`, background: color }} />
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums", minWidth: "28px", textAlign: "right" }}>
                      {obsByClass[key]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel message="Observations will appear after scanning" />
            )}
          </SurfaceCard>

          <SurfaceCard className="col-span-12 md:col-span-8" noPad>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Recent Scan Activity
              </span>
              <a href="/discovery/scan-jobs" className="flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: "11px", fontWeight: 600, color: "#f8781e" }}>
                View all <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
            {recentScans.length === 0 ? (
              <EmptyPanel message="No completed scans yet" link="/discovery/scan-jobs" linkLabel="Start a scan" />
            ) : (
              <div>
                {recentScans.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: i < recentScans.length - 1 ? "1px solid #F5F5F7" : undefined }}
                  >
                    {s.status === "COMPLETED"
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#10B981" }} />
                      : <XCircle className="h-4 w-4 shrink-0" style={{ color: "#EF4444" }} />
                    }
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F1923" }}>{s.sensorName}</p>
                      <p className="truncate mt-0.5" style={{ fontSize: "11px", color: "#8A95A3" }}>
                        {s.targets.slice(0, 2).join(", ")}{s.targets.length > 2 ? ` +${s.targets.length - 2}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums" }}>
                        {s.resultCount.toLocaleString()}
                      </p>
                      <p style={{ fontSize: "10px", color: "#8A95A3" }}>observations</p>
                    </div>
                    <span style={{ fontSize: "10px", color: "#8A95A3", minWidth: "80px", textAlign: "right" }}>
                      {s.completedAt ? formatDate(s.completedAt) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      )}
    </PageShell>
  );
}

// â”€â”€ Primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EmptyPanel({ message, link, linkLabel }: { message: string; link?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
      <p style={{ fontSize: "12px", color: "#8A95A3" }}>{message}</p>
      {link && linkLabel && (
        <a href={link} style={{ fontSize: "12px", fontWeight: 600, color: "#f8781e" }}>{linkLabel} â†’</a>
      )}
    </div>
  );
}

function SurfaceCard({ children, className = "", noPad = false }: { children: React.ReactNode; className?: string; noPad?: boolean }) {
  void noPad;
  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className="px-5 py-3.5" style={{ borderBottom: light ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.06)" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: light ? "rgba(141,160,184,0.7)" : "#8A95A3" }}>
        {children}
      </p>
    </div>
  );
}

function KpiCard({ label, value, unit, sub, trend, trendUp, accent }: {
  label: string; value: string; unit: string; sub?: string; trend?: string; trendUp?: boolean; accent: string;
}) {
  return (
    <div className="rounded-xl px-4 py-4" style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.09em", color: "#8A95A3", textTransform: "uppercase" }}>{label}</p>
      <p className="mt-2 leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontSize: "28px", fontWeight: 800, color: accent, letterSpacing: "-0.02em" }}>{value}</span>
        {unit && <span style={{ fontSize: "13px", fontWeight: 400, color: "#8A95A3", marginLeft: "2px" }}>{unit}</span>}
      </p>
      {trend && (
        <p className="mt-1.5" style={{ fontSize: "11px", fontWeight: 500, color: trendUp ? "#10B981" : "#EF4444" }}>{trend}</p>
      )}
      {sub && !trend && (
        <p className="mt-1.5" style={{ fontSize: "11px", color: "#8A95A3" }}>{sub}</p>
      )}
      <div className="mt-3 h-[2px] w-8 rounded-full" style={{ background: accent, opacity: 0.4 }} />
    </div>
  );
}
