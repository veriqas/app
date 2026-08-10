import { PageShell } from "@/components/layout/page-shell";
import { getPostureSummary } from "@/lib/services/posture.service";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { formatDate, scoreRatingLabel } from "@/lib/utils";
import { ReadinessGauge } from "../../dashboard/readiness-gauge";

export default async function BoardReportPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const [posture, tenant, programmes, latestScores] = await Promise.all([
    getPostureSummary(tenantId).catch(() => null),
    ctx?.tenantId
      ? db.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true, name: true } })
      : null,
    db.programme.findMany({
      where: { tenantId },
      include: { phases: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    db.readinessScore.findMany({
      where: { tenantId },
      orderBy: { calculatedAt: "desc" },
      take: 6,
      select: { overallScore: true, overallRating: true, calculatedAt: true, scoreChange: true },
    }),
  ]);

  const score = posture?.readinessScore ?? 0;
  const scoreChange = posture?.scoreChange ?? null;
  const orgName = tenant?.displayName ?? tenant?.name ?? "Organisation";
  const reportDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const riskCounts = posture?.riskCounts ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const totalRisks = riskCounts.CRITICAL + riskCounts.HIGH + riskCounts.MEDIUM + riskCounts.LOW;

  return (
    <PageShell
      title="Board Reporting"
      breadcrumbs={[{ label: "Reporting" }, { label: "Board Reporting" }]}
    >
      {/* Report header */}
      <div
        className="mb-6 rounded-xl px-8 py-6"
        style={{ background: "#0C1524", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(141,160,184,0.6)", marginBottom: "8px" }}>
              Board Quantum Risk Report
            </p>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em" }}>
              {orgName}
            </h1>
            <p style={{ fontSize: "13px", color: "rgba(141,160,184,0.7)", marginTop: "6px" }}>
              Prepared: {reportDate} · Confidential
            </p>
          </div>
          <div className="text-right">
            <p style={{ fontSize: "11px", color: "rgba(141,160,184,0.6)", marginBottom: "4px" }}>Overall Readiness</p>
            <p style={{ fontSize: "48px", fontWeight: 900, color: "#f8781e", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {score}
              <span style={{ fontSize: "20px", fontWeight: 400, color: "rgba(141,160,184,0.5)" }}>/100</span>
            </p>
            <p style={{ fontSize: "12px", fontWeight: 600, color: score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444", marginTop: "4px" }}>
              {scoreRatingLabel(score)}
            </p>
            {scoreChange != null && (
              <p style={{ fontSize: "11px", color: "rgba(141,160,184,0.6)", marginTop: "2px" }}>
                {scoreChange >= 0 ? "▲" : "▼"} {Math.abs(scoreChange)} pts vs prior period
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Executive summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Quantum Risks", value: totalRisks, sub: `${riskCounts.CRITICAL} critical`, color: "#EF4444" },
          { label: "Quantum Vulnerable Assets", value: posture?.quantumVulnerableCount ?? 0, sub: "crypto assets", color: "#F97316" },
          { label: "Open Priority Actions", value: posture?.openActionCount ?? 0, sub: `${posture?.criticalActionCount ?? 0} overdue`, color: "#F59E0B" },
          { label: "Unassessed Suppliers", value: posture?.criticalSupplierUnassessedCount ?? 0, sub: "critical tier", color: "#8B5CF6" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl px-5 py-4"
            style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          >
            <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
              {card.label}
            </p>
            <p style={{ fontSize: "32px", fontWeight: 800, color: card.color, letterSpacing: "-0.02em", marginTop: "8px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {card.value}
            </p>
            <p style={{ fontSize: "11px", color: "#8A95A3", marginTop: "4px" }}>{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-5 mb-5">
        {/* Readiness gauge + dimensions */}
        <div
          className="col-span-12 md:col-span-5 rounded-xl overflow-hidden flex flex-col"
          style={{ background: "#0C1524", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(141,160,184,0.7)" }}>
              Readiness Profile
            </p>
          </div>
          <div className="flex flex-1 items-center justify-center px-5 py-6">
            <ReadinessGauge score={score} change={scoreChange ?? 0} rating={scoreRatingLabel(score)} />
          </div>
          <div className="grid grid-cols-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            {(posture?.dimensions ?? []).map((d, i) => (
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
                    <div className="h-[3px] rounded-full" style={{ width: `${Math.max(d.score, 2)}%`, background: "#f8781e" }} />
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#E2E8F0", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(d.score)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk breakdown */}
        <div
          className="col-span-12 md:col-span-7 rounded-xl overflow-hidden"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
              Top Quantum Risks
            </p>
          </div>
          <div>
            {(posture?.topRisks ?? []).slice(0, 6).map((r, i, arr) => (
              <div
                key={r.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderBottom: i < arr.length - 1 ? "1px solid #F5F5F7" : undefined }}
              >
                <span
                  className="shrink-0 rounded px-2 py-0.5"
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    background: r.residualRating === "CRITICAL" ? "#FEF2F2" : r.residualRating === "HIGH" ? "#FFF7ED" : "#FFFBEB",
                    color: r.residualRating === "CRITICAL" ? "#DC2626" : r.residualRating === "HIGH" ? "#EA580C" : "#D97706",
                  }}
                >
                  {r.residualRating}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: "13px", fontWeight: 500, color: "#0F1923" }}>{r.title}</p>
                  {r.businessService && (
                    <p style={{ fontSize: "11px", color: "#8A95A3", marginTop: "1px" }}>{r.businessService}</p>
                  )}
                </div>
                <span style={{ fontSize: "10px", color: "#8A95A3" }}>
                  {r.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
            {(posture?.topRisks ?? []).length === 0 && (
              <p className="px-5 py-6 text-center" style={{ fontSize: "12px", color: "#8A95A3" }}>No critical or high risks</p>
            )}
          </div>
        </div>
      </div>

      {/* Framework alignment */}
      {(posture?.frameworkAlignments ?? []).length > 0 && (
        <div
          className="mb-5 rounded-xl overflow-hidden"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
              Regulatory & Framework Alignment
            </p>
          </div>
          <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            {(posture?.frameworkAlignments ?? []).map((fw) => {
              const barColor = fw.alignedPct >= 80 ? "#10B981" : fw.alignedPct >= 50 ? "#F59E0B" : "#EF4444";
              return (
                <div key={fw.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0F1923" }}>{fw.shortName}</span>
                    <span style={{ fontSize: "20px", fontWeight: 800, color: barColor, fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(fw.alignedPct)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full" style={{ background: "#F5F5F7" }}>
                    <div className="h-2 rounded-full" style={{ width: `${fw.alignedPct}%`, background: barColor }} />
                  </div>
                  <div className="mt-1.5 flex justify-between" style={{ fontSize: "10px", color: "#8A95A3" }}>
                    <span>{fw.status.replace(/_/g, " ")}</span>
                    {fw.milestoneDate && <span>Due: {formatDate(fw.milestoneDate)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Migration programmes */}
      {programmes.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
              PQC Migration Programme Status
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: "#F5F5F7" }}>
            {programmes.map((prog) => {
              const completedPhases = prog.phases.filter((p) => p.status === "COMPLETED").length;
              const activePhase = prog.phases.find((p) => p.status === "IN_PROGRESS");
              return (
                <div key={prog.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: "14px", fontWeight: 600, color: "#0F1923" }}>{prog.title}</p>
                      <p style={{ fontSize: "12px", color: "#8A95A3", marginTop: "2px" }}>
                        {completedPhases}/{prog.phases.length} phases complete
                        {activePhase && ` · Active: ${activePhase.name}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p style={{ fontSize: "22px", fontWeight: 800, color: "#f8781e", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(prog.progress)}%
                      </p>
                      {prog.targetDate && (
                        <p style={{ fontSize: "11px", color: "#8A95A3" }}>Target: {formatDate(prog.targetDate)}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full rounded-full" style={{ background: "#F5F5F7" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${prog.progress}%`, background: "#f8781e" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}
