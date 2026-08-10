"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { RefreshCw, CheckCircle2, XCircle, Radio, AlertTriangle, Container } from "lucide-react";

interface ScannerHealth {
  sensorType:      string;
  status:          "available" | "missing" | "agent_required" | "error";
  version:         string | null;
  requiresAgent:   boolean;
  requiresClone:   boolean;
  platformSupport: string[];
  installInstructions: {
    linux?:   string;
    mac?:     string;
    windows?: string;
    pip?:     string;
    docker?:  string;
    url?:     string;
  };
}

interface EnvironmentHealth {
  scanners:        ScannerHealth[];
  totalCount:      number;
  availableCount:  number;
  missingCount:    number;
  agentCount:      number;
  checkedAt:       string;
}

const STATUS: Record<
  ScannerHealth["status"],
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  available:      { label: "Available",      color: "#16a34a", bg: "#dcfce7", icon: CheckCircle2 },
  missing:        { label: "Not Installed",  color: "#dc2626", bg: "#fee2e2", icon: XCircle },
  agent_required: { label: "Agent Required", color: "#d97706", bg: "#fef3c7", icon: Radio },
  error:          { label: "Error",          color: "#6b7280", bg: "#f3f4f6", icon: AlertTriangle },
};

// Ordered categories for display
const CATEGORY_ORDER = ["NETWORK_TRANSPORT", "SOURCE_CODE", "SUPPLY_CHAIN", "INFRASTRUCTURE", "SECRETS", "HOST_COMPLIANCE", "AGENT"];

const SCANNER_CATEGORIES: Record<string, string> = {
  SSLYZE:       "Network & Transport",
  SSH_AUDIT:    "Network & Transport",
  ZGRAB2:       "Network & Transport",
  TESTSSL:      "Network & Transport",
  NMAP:         "Network & Transport",
  OSQUERY:      "Network & Transport",
  CRYPTOSCAN:   "Source Code",
  SEMGREP:      "Source Code",
  CBOMKIT:      "Source Code",
  GITLEAKS:     "Secrets & Keys",
  CRYPTODEPS:   "Supply Chain",
  SYFT:         "Supply Chain",
  GRYPE:        "Supply Chain",
  TRIVY:        "Supply Chain",
  CHECKOV:      "Infrastructure",
  KUBE_BENCH:   "Infrastructure",
  KUBE_HUNTER:  "Infrastructure",
  OPENSCAP:     "Host & Compliance",
  ZEEK:         "On-Premise Agent",
};

function installHint(inst: ScannerHealth["installInstructions"]): string | null {
  return inst.pip ?? inst.linux ?? inst.mac ?? inst.docker ?? inst.url ?? null;
}

function SummaryCard({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-white px-5 py-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="mt-0.5 text-xs font-medium" style={{ color: "#8A95A3" }}>{label}</p>
      <div className="mt-3 h-1 rounded-full" style={{ background: bg }}>
        <div className="h-1 rounded-full" style={{ background: color, width: "100%" }} />
      </div>
    </div>
  );
}

function ScannerRow({ s }: { s: ScannerHealth }) {
  const cfg = STATUS[s.status];
  const Icon = cfg.icon;
  const hint = s.status === "missing" ? installHint(s.installInstructions) : null;

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 pl-5 pr-3">
        <span className="font-mono text-[13px] font-semibold text-slate-800">{s.sensorType}</span>
      </td>
      <td className="px-3 py-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ color: cfg.color, background: cfg.bg }}
        >
          <Icon className="h-3 w-3" />
          {cfg.label}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-slate-400 font-mono">
        {s.version ?? "—"}
      </td>
      <td className="py-3 pl-3 pr-5 text-xs text-slate-400 max-w-xs">
        {hint && (
          <code className="block truncate rounded bg-slate-50 px-2 py-1 text-slate-500" title={hint}>
            {hint}
          </code>
        )}
        {s.status === "agent_required" && (
          <span className="text-amber-600">Deploy VERIQAS on-premise agent</span>
        )}
        {s.requiresClone && s.status === "available" && (
          <span className="text-slate-400">Clones git repo before scanning</span>
        )}
      </td>
    </tr>
  );
}

function ScannerGroup({ category, scanners }: { category: string; scanners: ScannerHealth[] }) {
  if (!scanners.length) return null;
  const available = scanners.filter(s => s.status === "available").length;

  return (
    <div className="overflow-hidden rounded-2xl bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {/* Group header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <p style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {category}
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={
            available === scanners.length
              ? { color: "#16a34a", background: "#dcfce7" }
              : available === 0
              ? { color: "#dc2626", background: "#fee2e2" }
              : { color: "#d97706", background: "#fef3c7" }
          }
        >
          {available}/{scanners.length}
        </span>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-50">
            {["Scanner", "Status", "Version", "Install / Notes"].map(h => (
              <th key={h} className="py-2 pl-5 pr-3 text-left first:pl-5 last:pr-5"
                style={{ fontSize: "10px", fontWeight: 700, color: "#C4CBD4", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scanners.map(s => <ScannerRow key={s.sensorType} s={s} />)}
        </tbody>
      </table>
    </div>
  );
}

export default function EnvironmentHealthPage() {
  const [health, setHealth] = useState<EnvironmentHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scanner-health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHealth(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const refreshButton = (
    <button
      onClick={load}
      disabled={loading}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      Refresh
    </button>
  );

  // Group scanners by category
  const grouped = health ? Object.entries(
    health.scanners.reduce<Record<string, ScannerHealth[]>>((acc, s) => {
      const cat = SCANNER_CATEGORIES[s.sensorType] ?? "Other";
      (acc[cat] ??= []).push(s);
      return acc;
    }, {})
  ) : [];

  return (
    <PageShell
      title="Environment Health"
      breadcrumbs={[{ label: "Admin" }, { label: "Environment Health" }]}
      actions={refreshButton}
    >
      <div className="space-y-5">

        {/* Docker banner */}
        {health && health.missingCount > 0 && (
          <div
            className="flex items-start gap-4 rounded-2xl px-5 py-4"
            style={{ background: "linear-gradient(135deg, #0C1524 0%, #132033 100%)", border: "1px solid rgba(71,204,98,0.2)" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(71,204,98,0.15)" }}>
              <Container className="h-5 w-5" style={{ color: "#f8781e" }} />
            </div>
            <div className="flex-1">
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#FFFFFF", marginBottom: "4px" }}>
                {health.missingCount} scanner{health.missingCount !== 1 ? "s" : ""} not installed
              </p>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                All scanners are pre-installed in the VERIQAS Docker image. Run the platform via Docker to get every scanner working out of the box — no manual installs required.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <code style={{ fontSize: "11px", background: "rgba(71,204,98,0.12)", color: "#f8781e", border: "1px solid rgba(71,204,98,0.2)", borderRadius: "6px", padding: "3px 10px", fontFamily: "monospace" }}>
                  ./setup.sh
                </code>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", alignSelf: "center" }}>or on Windows:</span>
                <code style={{ fontSize: "11px", background: "rgba(71,204,98,0.12)", color: "#f8781e", border: "1px solid rgba(71,204,98,0.2)", borderRadius: "6px", padding: "3px 10px", fontFamily: "monospace" }}>
                  powershell -File setup.ps1
                </code>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Summary row */}
        {health && (
          <div className="flex gap-4">
            <SummaryCard value={health.availableCount}  label="Available"      color="#16a34a" bg="#dcfce7" />
            <SummaryCard value={health.missingCount}    label="Not Installed"  color="#dc2626" bg="#fee2e2" />
            <SummaryCard value={health.agentCount}      label="Agent Required" color="#d97706" bg="#fef3c7" />
            <SummaryCard value={health.totalCount}      label="Total Scanners" color="#6b7280" bg="#f3f4f6" />
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !health && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }} />
            ))}
          </div>
        )}

        {/* Scanner groups */}
        {health && (
          <div className="space-y-4">
            {grouped.map(([cat, scanners]) => (
              <ScannerGroup key={cat} category={cat} scanners={scanners} />
            ))}
          </div>
        )}

        {/* Footer */}
        {health && (
          <p className="text-right text-xs text-slate-400">
            Last checked {new Date(health.checkedAt).toLocaleString()}
          </p>
        )}

      </div>
    </PageShell>
  );
}
