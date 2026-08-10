import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, Circle, Clock, AlertTriangle, TrendingUp } from "lucide-react";

export default async function ProgrammesPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const programmes = await db.programme.findMany({
    where: { tenantId },
    include: {
      phases: { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PageShell
      title="Programmes"
      breadcrumbs={[{ label: "Governance" }, { label: "Programmes" }]}
    >
      {programmes.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300">
          <p className="text-sm text-slate-400">No programmes found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {programmes.map((prog) => {
            const completedPhases = prog.phases.filter((p) => p.status === "COMPLETED").length;
            const totalPhases = prog.phases.length;

            return (
              <div
                key={prog.id}
                className="rounded-xl overflow-hidden"
                style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
              >
                {/* Programme header */}
                <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#CBD3DF", fontWeight: 600 }}>
                          {prog.ref}
                        </span>
                        <StatusChip status={prog.status} />
                      </div>
                      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.01em" }}>
                        {prog.title}
                      </h2>
                      {prog.description && (
                        <p className="mt-1" style={{ fontSize: "13px", color: "#8A95A3" }}>{prog.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p style={{ fontSize: "32px", fontWeight: 800, color: "#f8781e", letterSpacing: "-0.02em", lineHeight: 1 }}>
                        {Math.round(prog.progress)}
                        <span style={{ fontSize: "16px", fontWeight: 400, color: "#8A95A3" }}>%</span>
                      </p>
                      <p style={{ fontSize: "11px", color: "#8A95A3", marginTop: "2px" }}>complete</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "#F5F5F7" }}>
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${prog.progress}%`, background: "#f8781e" }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs" style={{ color: "#8A95A3" }}>
                      <span>{completedPhases} of {totalPhases} phases complete</span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Target readiness: {prog.targetReadiness ?? "—"}
                      </span>
                    </div>
                  </div>

                  {/* Dates */}
                  {(prog.startDate || prog.targetDate) && (
                    <div className="mt-3 flex items-center gap-4">
                      {prog.startDate && (
                        <span style={{ fontSize: "11px", color: "#8A95A3" }}>
                          Started: <span style={{ fontWeight: 600, color: "#4A5568" }}>{formatDate(prog.startDate)}</span>
                        </span>
                      )}
                      {prog.targetDate && (
                        <span style={{ fontSize: "11px", color: "#8A95A3" }}>
                          Target: <span style={{ fontWeight: 600, color: "#4A5568" }}>{formatDate(prog.targetDate)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Phases timeline */}
                <div className="px-6 py-5">
                  <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3", marginBottom: "16px" }}>
                    Phases
                  </p>
                  <div className="relative">
                    {/* Connector line */}
                    <div
                      className="absolute top-4 left-4 right-4 h-[2px]"
                      style={{ background: "#F5F5F7" }}
                    />
                    {/* Progress fill */}
                    {completedPhases > 0 && (
                      <div
                        className="absolute top-4 left-4 h-[2px]"
                        style={{
                          width: `${((completedPhases - 1 + 0.5) / Math.max(totalPhases - 1, 1)) * (100 - (100 / totalPhases))}%`,
                          background: "#f8781e",
                        }}
                      />
                    )}

                    <div className="relative flex justify-between gap-2">
                      {prog.phases.map((phase) => {
                        const isCompleted = phase.status === "COMPLETED";
                        const isActive = phase.status === "IN_PROGRESS";
                        return (
                          <div key={phase.id} className="flex flex-col items-center gap-2" style={{ flex: 1 }}>
                            <div
                              className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full"
                              style={{
                                background: isCompleted ? "#f8781e" : isActive ? "#EFF9FD" : "#F5F5F7",
                                border: isActive ? "2px solid #f8781e" : "none",
                              }}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-4 w-4" style={{ color: "#FFFFFF" }} />
                              ) : isActive ? (
                                <Clock className="h-3.5 w-3.5" style={{ color: "#f8781e" }} />
                              ) : (
                                <Circle className="h-3.5 w-3.5" style={{ color: "#CBD3DF" }} />
                              )}
                            </div>
                            <div className="text-center">
                              <p style={{ fontSize: "11px", fontWeight: 600, color: isCompleted ? "#0F1923" : isActive ? "#f8781e" : "#8A95A3" }}>
                                {phase.name}
                              </p>
                              {phase.targetDate && (
                                <p style={{ fontSize: "10px", color: "#CBD3DF", marginTop: "2px" }}>
                                  {formatDate(phase.targetDate)}
                                </p>
                              )}
                              {phase.projectedScore != null && (
                                <p style={{ fontSize: "10px", color: "#8A95A3", marginTop: "1px" }}>
                                  â†’{phase.projectedScore}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    IN_PROGRESS: { label: "In Progress", bg: "#EFF9FD", color: "#0891B2" },
    PLANNING:    { label: "Planning",    bg: "#F5F5F7", color: "#8A95A3" },
    COMPLETED:   { label: "Completed",  bg: "#F0FDF4", color: "#16A34A" },
    ON_HOLD:     { label: "On Hold",    bg: "#FEF9C3", color: "#CA8A04" },
  };
  const s = map[status] ?? { label: status.replace(/_/g, " "), bg: "#F5F5F7", color: "#8A95A3" };
  return (
    <span
      className="rounded px-2 py-0.5"
      style={{ fontSize: "10px", fontWeight: 600, background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}
