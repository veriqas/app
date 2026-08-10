import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";

export default async function SupplierAssessmentsPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const suppliers = await db.supplier.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: [{ criticality: "asc" }, { name: "asc" }],
  });

  const total = suppliers.length;
  const assessed = suppliers.filter((s) => s.lastAssessedAt).length;
  const notAssessed = total - assessed;
  const criticalNotAssessed = suppliers.filter((s) => s.criticality === "CRITICAL" && !s.lastAssessedAt).length;
  const overdue = suppliers.filter((s) => s.nextAssessmentAt && s.nextAssessmentAt < new Date()).length;

  const ratingMap: Record<string, { label: string; bg: string; color: string }> = {
    ADEQUATE:     { label: "Adequate",     bg: "#F0FDF4", color: "#16A34A" },
    DEVELOPING:   { label: "Developing",   bg: "#FEF9C3", color: "#CA8A04" },
    POOR:         { label: "Poor",         bg: "#FEF2F2", color: "#DC2626" },
    NOT_ASSESSED: { label: "Not Assessed", bg: "#F5F5F7", color: "#8A95A3" },
  };

  const planMap: Record<string, { label: string; color: string }> = {
    REVIEWED:      { label: "Reviewed",      color: "#16A34A" },
    RECEIVED:      { label: "Received",      color: "#0891B2" },
    REQUESTED:     { label: "Requested",     color: "#CA8A04" },
    NOT_REQUESTED: { label: "Not Requested", color: "#EF4444" },
  };

  return (
    <PageShell
      title="Supplier Assessments"
      breadcrumbs={[{ label: "Third Parties" }, { label: "Supplier Assessments" }]}
    >
      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Suppliers",         value: total,              color: "#f8781e" },
          { label: "Assessed",                value: assessed,           color: "#10B981" },
          { label: "Not Assessed",            value: notAssessed,        color: "#F59E0B" },
          { label: "Critical — Not Assessed", value: criticalNotAssessed, color: "#EF4444" },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl px-4 py-4"
            style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          >
            <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A95A3" }}>
              {k.label}
            </p>
            <p style={{ fontSize: "32px", fontWeight: 800, color: k.color, letterSpacing: "-0.02em", marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        {/* Header */}
        <div
          className="grid px-5 py-3"
          style={{
            gridTemplateColumns: "2fr 2fr 100px 120px 120px 130px 110px",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "#8A95A3",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            background: "#FAFAFA",
          }}
        >
          <span>Supplier</span>
          <span>Service</span>
          <span>Criticality</span>
          <span>QRC Rating</span>
          <span>PQC Plan</span>
          <span>Last Assessed</span>
          <span>Next Due</span>
        </div>

        {suppliers.map((s, i) => {
          const rating = ratingMap[s.quantumReadinessRating ?? "NOT_ASSESSED"] ?? ratingMap.NOT_ASSESSED;
          const plan = planMap[s.migrationPlanStatus ?? "NOT_REQUESTED"] ?? { label: s.migrationPlanStatus ?? "—", color: "#8A95A3" };
          const isOverdue = s.nextAssessmentAt && s.nextAssessmentAt < new Date();

          return (
            <div
              key={s.id}
              className="grid items-center px-5 py-3.5 hover:bg-slate-50 transition-colors"
              style={{
                gridTemplateColumns: "2fr 2fr 100px 120px 120px 130px 110px",
                borderTop: i === 0 ? undefined : "1px solid #F5F5F7",
              }}
            >
              <div className="min-w-0">
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F1923" }}>{s.name}</p>
                <p style={{ fontSize: "10px", fontFamily: "monospace", color: "#CBD3DF", marginTop: "1px" }}>{s.ref}</p>
              </div>
              <p className="truncate" style={{ fontSize: "12px", color: "#4A5568" }}>{s.serviceProvided ?? "—"}</p>
              <span>
                <span
                  className="rounded px-2 py-0.5"
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    background: s.criticality === "CRITICAL" ? "#FEF2F2" : s.criticality === "HIGH" ? "#FFF7ED" : "#F5F5F7",
                    color: s.criticality === "CRITICAL" ? "#DC2626" : s.criticality === "HIGH" ? "#EA580C" : "#8A95A3",
                  }}
                >
                  {s.criticality}
                </span>
              </span>
              <span>
                <span className="rounded px-2 py-0.5" style={{ fontSize: "10px", fontWeight: 600, background: rating.bg, color: rating.color }}>
                  {rating.label}
                </span>
              </span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: plan.color }}>
                {plan.label}
              </span>
              <span style={{ fontSize: "11px", color: s.lastAssessedAt ? "#4A5568" : "#EF4444", fontVariantNumeric: "tabular-nums" }}>
                {s.lastAssessedAt ? formatDate(s.lastAssessedAt) : "Not assessed"}
              </span>
              <span style={{ fontSize: "11px", color: isOverdue ? "#EF4444" : "#4A5568", fontWeight: isOverdue ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
                {s.nextAssessmentAt ? formatDate(s.nextAssessmentAt) : "—"}
                {isOverdue && " ⚠"}
              </span>
            </div>
          );
        })}

        {suppliers.length === 0 && (
          <p className="px-5 py-8 text-center" style={{ fontSize: "12px", color: "#8A95A3" }}>
            No active suppliers found
          </p>
        )}
      </div>
    </PageShell>
  );
}
