import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { formatDate, scoreRatingLabel } from "@/lib/utils";

export default async function TrendsPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const [scores, riskHistory, obsHistory] = await Promise.all([
    db.readinessScore.findMany({
      where: { tenantId },
      orderBy: { calculatedAt: "asc" },
      select: {
        overallScore: true,
        overallRating: true,
        calculatedAt: true,
        scoreChange: true,
        dimensions: true,
        confidence: true,
      },
    }),
    db.risk.groupBy({
      by: ["residualRating"],
      where: { tenantId, isActive: true },
      _count: true,
    }),
    db.cryptoObservation.groupBy({
      by: ["quantumClass"],
      where: { tenantId, isActive: true },
      _count: true,
    }),
  ]);

  const latestScore = scores[scores.length - 1] ?? null;
  const riskMap: Record<string, number> = {};
  for (const r of riskHistory) riskMap[r.residualRating] = r._count;
  const obsMap: Record<string, number> = {};
  for (const o of obsHistory) obsMap[o.quantumClass] = o._count;

  const totalObs = Object.values(obsMap).reduce((s, v) => s + v, 0);

  return (
    <PageShell
      title="Trends & Analytics"
      breadcrumbs={[{ label: "Reporting" }, { label: "Trends & Analytics" }]}
    >
      {/* Readiness score history */}
      <div
        className="mb-5 rounded-xl overflow-hidden"
        style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
            Readiness Score History
          </p>
        </div>
        {scores.length === 0 ? (
          <p className="px-5 py-6 text-center" style={{ fontSize: "12px", color: "#8A95A3" }}>
            No score history yet — run a scan or re-score to generate data
          </p>
        ) : (
          <div>
            {/* Mini chart — bar graph of scores */}
            <div className="px-6 py-5">
              <div className="flex items-end gap-2 h-28">
                {scores.map((s, i) => {
                  const isLatest = i === scores.length - 1;
                  const barColor = s.overallScore >= 75 ? "#10B981" : s.overallScore >= 50 ? "#F59E0B" : s.overallScore >= 25 ? "#F97316" : "#EF4444";
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${formatDate(s.calculatedAt)}: ${s.overallScore}`}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: isLatest ? barColor : "#8A95A3", fontVariantNumeric: "tabular-nums" }}>
                        {s.overallScore}
                      </span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${Math.max((s.overallScore / 100) * 80, 4)}px`,
                          background: isLatest ? barColor : "#E2E8F0",
                          minWidth: "24px",
                        }}
                      />
                      <span style={{ fontSize: "9px", color: "#CBD3DF", textAlign: "center", lineHeight: 1.2 }}>
                        {new Date(s.calculatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Score details table */}
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <div
                className="grid px-5 py-2"
                style={{ gridTemplateColumns: "1fr 80px 80px 80px 80px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A95A3" }}
              >
                <span>Date</span>
                <span className="text-right">Score</span>
                <span className="text-right">Change</span>
                <span className="text-right">Rating</span>
                <span className="text-right">Confidence</span>
              </div>
              {[...scores].reverse().map((s, i) => {
                const barColor = s.overallScore >= 75 ? "#10B981" : s.overallScore >= 50 ? "#F59E0B" : s.overallScore >= 25 ? "#F97316" : "#EF4444";
                return (
                  <div
                    key={i}
                    className="grid px-5 py-3"
                    style={{
                      gridTemplateColumns: "1fr 80px 80px 80px 80px",
                      borderTop: "1px solid #F5F5F7",
                      fontSize: "12px",
                      fontVariantNumeric: "tabular-nums",
                      background: i === 0 ? "#FAFEFF" : "transparent",
                    }}
                  >
                    <span style={{ color: "#4A5568", fontWeight: i === 0 ? 600 : 400 }}>
                      {formatDate(s.calculatedAt)}{i === 0 ? " · Latest" : ""}
                    </span>
                    <span className="text-right" style={{ fontWeight: 700, color: barColor }}>{s.overallScore}</span>
                    <span className="text-right" style={{ color: (s.scoreChange ?? 0) >= 0 ? "#10B981" : "#EF4444" }}>
                      {s.scoreChange != null ? `${s.scoreChange >= 0 ? "+" : ""}${s.scoreChange}` : "—"}
                    </span>
                    <span className="text-right" style={{ color: "#4A5568", fontSize: "11px" }}>
                      {scoreRatingLabel(s.overallScore)}
                    </span>
                    <span className="text-right" style={{ color: "#8A95A3", fontSize: "11px", textTransform: "capitalize" }}>
                      {s.confidence.toLowerCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Risk breakdown */}
        <div
          className="col-span-12 md:col-span-6 rounded-xl overflow-hidden"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
              Risk Distribution (Current)
            </p>
          </div>
          <div className="px-5 py-5 space-y-4">
            {([
              ["CRITICAL", "#EF4444"],
              ["HIGH",     "#F97316"],
              ["MEDIUM",   "#F59E0B"],
              ["LOW",      "#10B981"],
            ] as [string, string][]).map(([rating, color]) => {
              const count = riskMap[rating] ?? 0;
              const total = Object.values(riskMap).reduce((s, v) => s + v, 0);
              return (
                <div key={rating} className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "#4A5568", minWidth: "60px" }}>{rating}</span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "#F5F5F7" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${total > 0 ? (count/total)*100 : 0}%`, background: color }} />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923", minWidth: "28px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {count}
                  </span>
                </div>
              );
            })}
            <div className="pt-2" style={{ borderTop: "1px solid #F5F5F7" }}>
              <p style={{ fontSize: "11px", color: "#8A95A3" }}>
                Total open risks: <span style={{ fontWeight: 700, color: "#0F1923" }}>{Object.values(riskMap).reduce((s, v) => s + v, 0)}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Observation breakdown */}
        <div
          className="col-span-12 md:col-span-6 rounded-xl overflow-hidden"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
              Cryptographic Observations (Current)
            </p>
          </div>
          <div className="px-5 py-5 space-y-4">
            {([
              ["QUANTUM_VULNERABLE",       "Quantum Vulnerable",  "#EF4444"],
              ["QUANTUM_REDUCED_SECURITY", "Reduced Security",    "#F97316"],
              ["QUANTUM_RESILIENT",        "Quantum Resilient",   "#10B981"],
              ["POST_QUANTUM",             "Post-Quantum",        "#059669"],
              ["HYBRID",                   "Hybrid",              "#6366F1"],
              ["UNKNOWN",                  "Unclassified",        "#CBD3DF"],
            ] as [string, string, string][]).filter(([k]) => (obsMap[k] ?? 0) > 0).map(([key, label, color]) => {
              const count = obsMap[key] ?? 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "#4A5568", flex: 1 }}>{label}</span>
                  <div className="w-28 h-1.5 rounded-full" style={{ background: "#F5F5F7" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${totalObs > 0 ? (count/totalObs)*100 : 0}%`, background: color }} />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923", minWidth: "36px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {count}
                  </span>
                </div>
              );
            })}
            {totalObs === 0 && (
              <p style={{ fontSize: "12px", color: "#8A95A3", textAlign: "center", padding: "16px 0" }}>
                No cryptographic observations yet — run discovery scans
              </p>
            )}
            {totalObs > 0 && (
              <div className="pt-2" style={{ borderTop: "1px solid #F5F5F7" }}>
                <p style={{ fontSize: "11px", color: "#8A95A3" }}>
                  Total observations: <span style={{ fontWeight: 700, color: "#0F1923" }}>{totalObs.toLocaleString()}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Dimension scores */}
        {latestScore && (
          <div
            className="col-span-12 rounded-xl overflow-hidden"
            style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          >
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
                Readiness Dimensions — Latest Score
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "#F5F5F7" }}>
              {Object.entries(latestScore.dimensions as Record<string, number>).map(([key, val]) => {
                const LABELS: Record<string, string> = {
                  cryptoVisibility: "Crypto Visibility",
                  quantumExposure:  "Quantum Exposure",
                  dataLongevity:    "Data Longevity",
                  migrationPrep:    "Migration Prep",
                  thirdParty:       "Third-Party",
                  governance:       "Governance",
                  cryptoAgility:    "Crypto Agility",
                };
                const score = typeof val === "number" ? val : 0;
                const color = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
                return (
                  <div key={key} className="px-5 py-4" style={{ background: "#FFFFFF" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A95A3" }}>
                      {LABELS[key] ?? key}
                    </p>
                    <p style={{ fontSize: "28px", fontWeight: 800, color, letterSpacing: "-0.02em", marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(score)}
                    </p>
                    <div className="mt-2 h-1 w-full rounded-full" style={{ background: "#F5F5F7" }}>
                      <div className="h-1 rounded-full" style={{ width: `${score}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
