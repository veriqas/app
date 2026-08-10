import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";

export default async function FrameworksPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const frameworks = await db.framework.findMany({
    where: { tenantId, isApplicable: true },
    include: {
      alignmentScores: {
        orderBy: { calculatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { isMandatory: "desc" },
  });

  const mandatory = frameworks.filter((f) => f.isMandatory);
  const voluntary = frameworks.filter((f) => !f.isMandatory);

  return (
    <PageShell
      title="Frameworks"
      breadcrumbs={[{ label: "Governance" }, { label: "Frameworks" }]}
    >
      <div className="space-y-6">
        {mandatory.length > 0 && (
          <Section title="Mandatory Frameworks" frameworks={mandatory} />
        )}
        {voluntary.length > 0 && (
          <Section title="Voluntary / Guidance Frameworks" frameworks={voluntary} />
        )}
        {frameworks.length === 0 && (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300">
            <p className="text-sm text-slate-400">No frameworks configured</p>
          </div>
        )}
      </div>
    </PageShell>
  );
}

interface FwWithAlignment {
  id: string;
  name: string;
  shortName: string;
  issuingAuthority: string | null;
  version: string;
  milestoneDate: Date | null;
  isMandatory: boolean;
  alignmentScores: Array<{
    alignedPct: number;
    evidenceCompleteness: number;
    controlImplementation: number;
    openGaps: number;
    status: string;
    confidence: string;
    details: unknown;
  }>;
}

function Section({ title, frameworks }: { title: string; frameworks: FwWithAlignment[] }) {
  return (
    <div>
      <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3", marginBottom: "12px" }}>
        {title}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {frameworks.map((fw) => {
          const al = fw.alignmentScores[0] ?? null;
          const gaps = (al?.details as { gaps?: string[] } | null)?.gaps ?? [];
          const alignedPct = al?.alignedPct ?? 0;
          const statusMap: Record<string, { label: string; color: string; bg: string }> = {
            ALIGNED:           { label: "Aligned",           color: "#16A34A", bg: "#F0FDF4" },
            PARTIALLY_ALIGNED: { label: "Partially Aligned", color: "#CA8A04", bg: "#FEF9C3" },
            NOT_ALIGNED:       { label: "Not Aligned",       color: "#DC2626", bg: "#FEF2F2" },
            NOT_ASSESSED:      { label: "Not Assessed",      color: "#8A95A3", bg: "#F5F5F7" },
          };
          const s = statusMap[al?.status ?? "NOT_ASSESSED"] ?? statusMap.NOT_ASSESSED;
          const barColor = alignedPct >= 80 ? "#10B981" : alignedPct >= 50 ? "#F59E0B" : "#EF4444";

          return (
            <div
              key={fw.id}
              className="rounded-xl overflow-hidden flex flex-col"
              style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
            >
              {/* Header */}
              <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923" }}
                  >
                    {fw.shortName}
                  </span>
                  {fw.isMandatory && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5"
                      style={{ fontSize: "9px", fontWeight: 700, background: "#FEF2F2", color: "#DC2626", letterSpacing: "0.05em", textTransform: "uppercase" }}
                    >
                      Mandatory
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "11px", color: "#8A95A3" }}>{fw.issuingAuthority} · v{fw.version}</p>
                {fw.milestoneDate && (
                  <p style={{ fontSize: "11px", color: "#8A95A3", marginTop: "4px" }}>
                    Deadline: <span style={{ fontWeight: 600, color: "#4A5568" }}>{formatDate(fw.milestoneDate)}</span>
                  </p>
                )}
              </div>

              {/* Alignment */}
              <div className="px-5 py-4 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: "11px", color: "#8A95A3" }}>Alignment</span>
                  <span
                    className="rounded px-2 py-0.5"
                    style={{ fontSize: "10px", fontWeight: 600, background: s.bg, color: s.color }}
                  >
                    {s.label}
                  </span>
                </div>

                <div className="h-2 w-full rounded-full" style={{ background: "#F5F5F7" }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${alignedPct}%`, background: barColor }}
                  />
                </div>

                <div className="mt-1.5 flex justify-between" style={{ fontSize: "10px", color: "#8A95A3" }}>
                  <span>{Math.round(alignedPct)}% aligned</span>
                  {al && <span>Evidence: {Math.round(al.evidenceCompleteness)}%</span>}
                </div>

                {al && al.openGaps > 0 && (
                  <div className="mt-3">
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
                      Open Gaps ({al.openGaps})
                    </p>
                    <ul className="space-y-1">
                      {gaps.slice(0, 3).map((gap, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span
                            className="mt-1 shrink-0 h-1.5 w-1.5 rounded-full"
                            style={{ background: barColor }}
                          />
                          <span style={{ fontSize: "11px", color: "#4A5568" }}>{gap}</span>
                        </li>
                      ))}
                      {gaps.length > 3 && (
                        <li style={{ fontSize: "11px", color: "#8A95A3", paddingLeft: "14px" }}>
                          +{gaps.length - 3} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {al && (
                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{ borderTop: "1px solid rgba(0,0,0,0.06)", background: "#FAFAFA" }}
                >
                  <span style={{ fontSize: "10px", color: "#8A95A3" }}>
                    Controls implemented: <span style={{ fontWeight: 600, color: "#4A5568" }}>{Math.round(al.controlImplementation)}%</span>
                  </span>
                  <span style={{ fontSize: "10px", color: "#8A95A3" }}>
                    Confidence: <span style={{ fontWeight: 600, color: "#4A5568", textTransform: "capitalize" }}>{al.confidence.toLowerCase()}</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
