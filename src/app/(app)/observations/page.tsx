import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { RemediateButton } from "@/components/remediation/remediate-button";

const QC_META: Record<string, { label: string; color: string; bg: string }> = {
  QUANTUM_VULNERABLE:       { label: "Quantum Vulnerable",   color: "#EF4444", bg: "#FEF2F2" },
  QUANTUM_REDUCED_SECURITY: { label: "Reduced Security",     color: "#F97316", bg: "#FFF7ED" },
  QUANTUM_RESILIENT:        { label: "Quantum Resilient",    color: "#10B981", bg: "#ECFDF5" },
  POST_QUANTUM:             { label: "Post-Quantum",         color: "#059669", bg: "#ECFDF5" },
  HYBRID:                   { label: "Hybrid",               color: "#6366F1", bg: "#EEF2FF" },
  UNKNOWN:                  { label: "Unclassified",         color: "#8A95A3", bg: "#F5F5F7" },
};

const PT_LABEL: Record<string, string> = {
  KEY_ESTABLISHMENT:     "Key Exchange",
  DIGITAL_SIGNATURE:     "Digital Signature",
  PUBLIC_KEY_ENCRYPTION: "Public-Key Enc.",
  SYMMETRIC_ENCRYPTION:  "Symmetric Enc.",
  HASH:                  "Hash",
  MAC:                   "MAC",
  KEY_DERIVATION:        "Key Derivation",
  KEY_ENCAPSULATION:     "Key Encapsulation",
  STREAM_CIPHER:         "Stream Cipher",
};

const SENSOR_COLOR: Record<string, string> = {
  CRYPTOSCAN:  "#10B981",
  CRYPTODEPS:  "#6366F1",
  SEMGREP:     "#F59E0B",
  GITLEAKS:    "#EF4444",
  TRIVY:       "#3B82F6",
  SYFT:        "#8B5CF6",
  GRYPE:       "#EC4899",
  SSLYZE:      "#f8781e",
  SSH_AUDIT:   "#06B6D4",
};

export default async function ObservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ scanJobId?: string }>;
}) {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";
  const { scanJobId } = await searchParams;

  const baseWhere = { tenantId, isActive: true, ...(scanJobId ? { scanJobId } : {}) };

  // Load scan jobs that have observations, ordered newest first
  const scanJobsWithObs = await db.scanJob.findMany({
    where: {
      tenantId,
      status: "COMPLETED",
      results: { some: { isActive: true } },
    },
    include: {
      sensor: { select: { name: true, sensorType: true } },
      _count: { select: { results: true } },
    },
    orderBy: { completedAt: "desc" },
    take: 50,
  });

  // Load observations — filtered by job if selected, otherwise all
  const observations = await db.cryptoObservation.findMany({
    where: baseWhere,
    orderBy: [{ scanJobId: "asc" }, { quantumClass: "asc" }, { observedAt: "desc" }],
    take: 500,
    select: {
      id: true, ref: true, sensorType: true, algorithm: true,
      primitiveType: true, quantumClass: true, keySize: true,
      curve: true, endpoint: true, filePath: true, packageName: true,
      confidence: true, observedAt: true, scanJobId: true,
    },
  });

  // Summary stats across all (or filtered) observations
  const [byClass, byPrimitive] = await Promise.all([
    db.cryptoObservation.groupBy({ by: ["quantumClass"], where: baseWhere, _count: true }),
    db.cryptoObservation.groupBy({ by: ["primitiveType"], where: baseWhere, _count: true }),
  ]);

  const total = observations.length;
  const maxClass = Math.max(1, ...byClass.map(c => c._count));

  // Group observations by scanJobId
  const byJob = new Map<string | null, typeof observations>();
  for (const obs of observations) {
    const key = obs.scanJobId ?? null;
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key)!.push(obs);
  }

  // Find the selected job if filtering
  const selectedJob = scanJobId
    ? scanJobsWithObs.find(j => j.id === scanJobId)
    : null;

  return (
    <PageShell
      title="Observations"
      breadcrumbs={[{ label: "Discovery" }, { label: "Observations" }]}
    >
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.02em" }}>
            Cryptographic Observations
          </h1>
          <p className="mt-1" style={{ fontSize: "12px", color: "#8A95A3" }}>
            {total.toLocaleString()} observation{total !== 1 ? "s" : ""} across {scanJobsWithObs.length} scan{scanJobsWithObs.length !== 1 ? "s" : ""}
          </p>
        </div>
        {selectedJob && (
          <a
            href="/discovery/observations"
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
            style={{ borderColor: "#E2E8F0", background: "#F8FAFC", color: "#f8781e" }}
          >
            <span className="font-mono" style={{ color: "#0F1923" }}>{selectedJob.ref}</span>
            <span style={{ color: "#CBD5E0" }}>·</span>
            <span className="max-w-[180px] truncate" style={{ color: "#64748B" }}>
              {selectedJob.targets[0]}
            </span>
            <span style={{ color: "#94A3B8" }}>Ã— clear</span>
          </a>
        )}
      </div>

      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {byClass.sort((a,b) => b._count - a._count).slice(0, 4).map((c) => {
          const meta = QC_META[c.quantumClass] ?? QC_META["UNKNOWN"];
          return (
            <div key={c.quantumClass} className="rounded-xl px-4 py-4"
              style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.09em", color: "#8A95A3", textTransform: "uppercase", marginBottom: "6px" }}>
                {meta.label}
              </p>
              <p style={{ fontSize: "26px", fontWeight: 800, color: meta.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {c._count}
              </p>
              <div className="mt-3 h-1.5 w-full rounded-full" style={{ background: "#F5F5F7" }}>
                <div className="h-1.5 rounded-full" style={{ width: `${(c._count / maxClass) * 100}%`, background: meta.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* No data state */}
      {scanJobsWithObs.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl py-20 text-center"
          style={{ border: "1.5px dashed #E2E8F0", background: "#FAFBFC" }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "#0F1923" }}>No observations yet</p>
          <p style={{ fontSize: "12px", color: "#94A3B8" }}>Run a scanner from the Sensors page to start discovering cryptographic usage</p>
          <a href="/discovery/sensors"
            className="rounded-xl px-5 py-2 text-sm font-semibold"
            style={{ background: "#f8781e", color: "#fff" }}>
            Go to Sensors
          </a>
        </div>
      )}

      {/* Scan job sections */}
      {scanJobsWithObs.map((job) => {
        const jobObs = byJob.get(job.id) ?? [];
        if (jobObs.length === 0) return null;
        const sensorColor = SENSOR_COLOR[job.sensor.sensorType] ?? "#8A95A3";
        const vulnCount = jobObs.filter(o => o.quantumClass === "QUANTUM_VULNERABLE").length;
        const pqCount = jobObs.filter(o => o.quantumClass === "POST_QUANTUM").length;
        const isFiltered = scanJobId === job.id;

        return (
          <div key={job.id} className="mb-6 rounded-2xl overflow-hidden"
            style={{
              border: isFiltered ? `2px solid ${sensorColor}40` : "1px solid rgba(0,0,0,0.07)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              background: "#FFFFFF",
            }}>

            {/* Job header */}
            <div className="flex items-center justify-between gap-4 px-5 py-4"
              style={{ borderBottom: "1px solid #F5F5F7", background: "#FAFBFC" }}>
              <div className="flex items-center gap-3 min-w-0">
                {/* Scanner badge */}
                <span className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold"
                  style={{ background: `${sensorColor}15`, color: sensorColor }}>
                  {job.sensor.sensorType}
                </span>
                {/* Ref + target */}
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F1923", whiteSpace: "nowrap" }}>
                  {job.ref}
                </span>
                <span style={{ color: "#CBD5E0" }}>·</span>
                <span className="truncate" style={{ fontSize: "12px", color: "#64748B", fontFamily: "monospace" }}>
                  {job.targets[0]}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {/* Mini stats */}
                {vulnCount > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ background: "#FEF2F2", color: "#EF4444" }}>
                    {vulnCount} vulnerable
                  </span>
                )}
                {pqCount > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ background: "#ECFDF5", color: "#059669" }}>
                    {pqCount} PQ
                  </span>
                )}
                <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                  {jobObs.length} obs · {job.completedAt ? formatDate(job.completedAt) : "—"}
                </span>
                {/* Filter toggle */}
                <a
                  href={isFiltered ? "/discovery/observations" : `/discovery/observations?scanJobId=${job.id}`}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: isFiltered ? "#0F1923" : "#F3F4F6",
                    color: isFiltered ? "#fff" : "#6B7280",
                  }}>
                  {isFiltered ? "Clear filter" : "Filter"}
                </a>
              </div>
            </div>

            {/* Observations table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F7F9FC" }}>
                    {["Algorithm", "Primitive", "Classification", "Key/Curve", "Location", "Confidence", ""].map((h) => (
                      <th key={h} style={{
                        padding: "7px 14px", textAlign: "left", fontSize: "9px",
                        fontWeight: 700, color: "#8A95A3", letterSpacing: "0.07em",
                        textTransform: "uppercase", borderBottom: "1px solid #F0F4F8", whiteSpace: "nowrap",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobObs.map((obs, i) => {
                    const qc = QC_META[obs.quantumClass] ?? QC_META["UNKNOWN"];
                    const location = obs.filePath ?? obs.endpoint ?? obs.packageName ?? "—";
                    const keyInfo = obs.keySize ? `${obs.keySize}-bit` : obs.curve ?? "—";
                    return (
                      <tr key={obs.id} style={{
                        borderBottom: "1px solid #F5F5F7",
                        background: i % 2 === 1 ? "#FAFAFA" : "#FFFFFF",
                      }}>
                        <td style={{ padding: "8px 14px", fontSize: "12px", fontWeight: 600, color: "#0F1923", whiteSpace: "nowrap" }}>
                          {obs.algorithm ?? "—"}
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: "11px", color: "#4A5568", whiteSpace: "nowrap" }}>
                          {PT_LABEL[obs.primitiveType ?? ""] ?? obs.primitiveType ?? "—"}
                        </td>
                        <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
                          <span className="rounded-full px-2 py-0.5"
                            style={{ fontSize: "10px", fontWeight: 700, color: qc.color, background: qc.bg }}>
                            {qc.label}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: "11px", color: "#8A95A3", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {keyInfo}
                        </td>
                        <td style={{ padding: "8px 14px", maxWidth: "260px" }}>
                          <p className="truncate" style={{ fontSize: "11px", color: "#8A95A3", fontFamily: "monospace" }}
                            title={location}>
                            {location.length > 45 ? `…${location.slice(-43)}` : location}
                          </p>
                        </td>
                        <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-10 rounded-full" style={{ background: "#F5F5F7" }}>
                              <div className="h-1.5 rounded-full"
                                style={{ width: `${obs.confidence}%`, background: obs.confidence >= 80 ? "#10B981" : "#F59E0B" }} />
                            </div>
                            <span style={{ fontSize: "10px", color: "#8A95A3", fontVariantNumeric: "tabular-nums" }}>
                              {obs.confidence}%
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
                          {obs.sensorType === "CRYPTOSCAN" && obs.filePath && (
                            <RemediateButton observationId={obs.id} quantumClass={obs.quantumClass} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Primitive type breakdown — shown when not filtered to single job */}
      {!scanJobId && scanJobsWithObs.length > 0 && (
        <div className="mt-2 rounded-xl"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F5F5F7" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              All observations by primitive type
            </p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {byPrimitive.sort((a, b) => b._count - a._count).map((p) => {
              const label = PT_LABEL[p.primitiveType ?? ""] ?? (p.primitiveType ?? "Unknown");
              const maxP = Math.max(1, ...byPrimitive.map(x => x._count));
              return (
                <div key={p.primitiveType} className="flex items-center gap-3">
                  <span className="flex-none" style={{ fontSize: "12px", color: "#4A5568", minWidth: "130px" }}>{label}</span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "#F5F5F7" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${(p._count / maxP) * 100}%`, background: "#f8781e" }} />
                  </div>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F1923", fontVariantNumeric: "tabular-nums", minWidth: "28px", textAlign: "right" }}>
                    {p._count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}
