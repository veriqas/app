"use client";

import { useState, useEffect } from "react";
import { PageShell } from "@/components/layout/page-shell";
import {
  ASSESSMENT_MODULES,
  getAssessmentScanners,
  type AssessmentModule,
} from "@/lib/assessments/registry";
import { SCANNER_REGISTRY } from "@/lib/scanners/registry";
import {
  Network, Code2, Package, Server, KeyRound,
  ShieldCheck, Zap, ChevronRight, Clock, X, Play, Cpu,
} from "lucide-react";

type AvailabilityMap = Record<string, { available: boolean; reason: string | null }>;

function StatusPill({ status }: { status: "loading" | "available" | "unavailable" | "agent" }) {
  if (status === "loading") return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
      style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#D1D5DB" }} />
      <span style={{ fontSize: "10px", fontWeight: 600, color: "#9CA3AF" }}>Checking…</span>
    </div>
  );
  if (status === "available") return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
      style={{ background: "#DCFCE7", border: "1px solid #86EFAC" }}>
      <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#16A34A" }} />
      <span style={{ fontSize: "10px", fontWeight: 700, color: "#15803D" }}>Enabled</span>
    </div>
  );
  if (status === "agent") return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
      style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
      <Cpu className="h-3 w-3" style={{ color: "#3B82F6" }} />
      <span style={{ fontSize: "10px", fontWeight: 700, color: "#1D4ED8" }}>Agent only</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
      style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#D1D5DB" }} />
      <span style={{ fontSize: "10px", fontWeight: 700, color: "#9CA3AF" }}>Not enabled</span>
    </div>
  );
}

// â”€â”€ Icon map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MODULE_ICONS: Record<string, React.ElementType> = {
  ENTERPRISE_READINESS: Zap,
  NETWORK_TRANSPORT:    Network,
  SOURCE_CODE:          Code2,
  SUPPLY_CHAIN:         Package,
  INFRASTRUCTURE:       Server,
  SECRETS:              KeyRound,
  HOST_COMPLIANCE:      ShieldCheck,
};

// â”€â”€ Individual scanner card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ScannerCard({
  scanner,
  onScanNow,
  availability,
}: {
  scanner: { sensorType: string; displayName: string; description: string; color: string; durationHint: string; inputTypes: string[] };
  onScanNow: (sensorType: string) => void;
  availability: AvailabilityMap | null;
}) {
  const av = availability?.[scanner.sensorType];
  const status: "loading" | "available" | "unavailable" | "agent" =
    !availability ? "loading" :
    !av ? "unavailable" :
    av.reason === "agent" ? "agent" :
    av.available ? "available" : "unavailable";
  const canRun = status === "available";

  return (
    <div
      className="flex flex-col rounded-xl p-4 transition-shadow hover:shadow-md"
      style={{
        background: "#FFFFFF",
        border: canRun ? "1px solid rgba(71,204,98,0.25)" : "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        opacity: status === "unavailable" ? 0.6 : 1,
      }}
    >
      {/* Top row: dot + name + status pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: scanner.color }} />
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923" }}>{scanner.displayName}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <p style={{ fontSize: "11px", color: "#6B7280", lineHeight: 1.55, marginTop: "8px", paddingLeft: "18px" }}>
        {scanner.description}
      </p>

      <div className="mt-3 flex items-center justify-between" style={{ paddingLeft: "18px" }}>
        <span className="flex items-center gap-1" style={{ fontSize: "10px", color: "#9CA3AF" }}>
          <Clock className="h-3 w-3" /> {scanner.durationHint}
        </span>
        <button
          onClick={() => canRun && onScanNow(scanner.sensorType)}
          disabled={!canRun}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: canRun ? `${scanner.color}18` : "#F3F4F6",
            color: canRun ? scanner.color : "#9CA3AF",
            cursor: canRun ? "pointer" : "not-allowed",
          }}
        >
          <Play className="h-3 w-3" />
          {canRun ? "Scan Now" : status === "agent" ? "Agent Only" : "Not Available"}
        </button>
      </div>
    </div>
  );
}

// â”€â”€ Category section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CategorySection({
  module,
  onScanNow,
  availability,
}: {
  module: AssessmentModule;
  onScanNow: (sensorType: string) => void;
  availability: AvailabilityMap | null;
}) {
  const Icon = MODULE_ICONS[module.id] ?? Zap;
  const scanners = getAssessmentScanners(module.id);
  const enabledCount = scanners.filter(s => s && availability?.[s.sensorType]?.available).length;

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${module.color}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: module.color }} />
        </div>
        <div className="flex-1">
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#0F1923" }}>{module.name}</h2>
          <p style={{ fontSize: "11px", color: "#9CA3AF" }}>{module.purpose}</p>
        </div>
        {availability && (
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              background: enabledCount > 0 ? "#DCFCE7" : "#F3F4F6",
              color: enabledCount > 0 ? "#15803D" : "#9CA3AF",
            }}>
            {enabledCount}/{scanners.length} enabled
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scanners.map(s => s && (
          <ScannerCard
            key={(s as { sensorType: string }).sensorType}
            scanner={s as { sensorType: string; displayName: string; description: string; color: string; durationHint: string; inputTypes: string[] }}
            onScanNow={onScanNow}
            availability={availability}
          />
        ))}
      </div>
    </div>
  );
}

// â”€â”€ Single-scanner quick-launch modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function QuickScanModal({
  sensorType,
  onClose,
}: {
  sensorType: string;
  onClose: () => void;
}) {
  const scanner = SCANNER_REGISTRY.find((s) => s.sensorType === sensorType);
  const [target, setTarget] = useState("");
  const [launching, setLaunching] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!scanner) return null;

  const placeholder =
    scanner.inputTypes.includes("GIT_REPO")       ? "https://github.com/org/repo" :
    scanner.inputTypes.includes("ENDPOINT")        ? "api.example.com:443" :
    scanner.inputTypes.includes("IP_RANGE")        ? "10.0.0.0/24" :
    scanner.inputTypes.includes("CONTAINER_IMAGE") ? "nginx:latest" :
    "Enter target…";

  async function handleLaunch() {
    if (!target.trim()) return;
    setLaunching(true);
    setError("");
    try {
      const res = await fetch("/api/scan-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensorType, targets: [target.trim()] }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to launch scan.");
      }
    } catch {
      setError("Network error.");
    }
    setLaunching(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(12,21,36,0.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-start gap-3 rounded-t-2xl px-6 py-5"
          style={{ background: `${scanner.color}0E`, borderBottom: "1px solid rgba(0,0,0,0.06)" }}
        >
          <div className="flex-1 min-w-0">
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0F1923" }}>{scanner.displayName}</h3>
            <p style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>{scanner.description}</p>
            <p style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>{scanner.durationHint}</p>
          </div>
          <button onClick={onClose} className="ml-2 rounded-lg p-1 hover:bg-black/5">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#f8781e18" }}>
              <Zap className="h-6 w-6" style={{ color: "#f8781e" }} />
            </div>
            <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0F1923", marginBottom: "6px" }}>Scan launched</h4>
            <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "20px" }}>
              Scan job queued. Results will appear in the Crypto Inventory.
            </p>
            <button
              onClick={() => { window.location.href = "/discovery/scan-jobs"; }}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: "#f8781e", color: "#fff" }}
            >
              View Scan Jobs <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="px-6 py-5">
            <label style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Target — {scanner.inputTypes.join(" / ")}
            </label>
            <input
              type="text"
              className="mt-1.5 w-full rounded-xl px-4 py-2.5 font-mono text-sm outline-none"
              style={{ border: "1px solid rgba(0,0,0,0.1)", background: "#F9FAFB", color: "#0F1923", fontSize: "13px" }}
              placeholder={placeholder}
              value={target}
              onChange={e => setTarget(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLaunch()}
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium" style={{ color: "#8A95A3" }}>
                Cancel
              </button>
              <button
                onClick={handleLaunch}
                disabled={!target.trim() || launching}
                className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold"
                style={{ background: scanner.color, color: "#fff", opacity: (!target.trim() || launching) ? 0.5 : 1 }}
              >
                <Play className="h-3.5 w-3.5" />
                {launching ? "Launching…" : "Launch Scan"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AssessmentsClient() {
  const [quickScan, setQuickScan] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityMap | null>(null);

  useEffect(() => {
    fetch("/api/scanners/availability")
      .then(r => r.json())
      .then(setAvailability)
      .catch(() => setAvailability({}));
  }, []);

  const modules = ASSESSMENT_MODULES.filter(m => !m.isFlagship);

  return (
    <PageShell
      title="Quantum Assessments"
      breadcrumbs={[{ label: "VERIQAS" }, { label: "Discovery" }, { label: "Quantum Assessments" }]}
    >
      {quickScan && (
        <QuickScanModal sensorType={quickScan} onClose={() => setQuickScan(null)} />
      )}

      <div className="mb-6">
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.02em" }}>
          Quantum Assessments
        </h1>
        <p className="mt-1" style={{ fontSize: "12px", color: "#8A95A3" }}>
          Select a scanner below and provide the required target to launch an individual scan.
        </p>
      </div>

      {modules.map(module => (
        <CategorySection
          key={module.id}
          module={module}
          onScanNow={(sensorType) => setQuickScan(sensorType)}
          availability={availability}
        />
      ))}

      <div
        className="mt-6 flex items-center gap-3 rounded-xl px-5 py-4"
        style={{ background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        <Clock className="h-4 w-4 shrink-0" style={{ color: "#8A95A3" }} />
        <div>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#0F1923" }}>Continuous Assessment</p>
          <p style={{ fontSize: "11px", color: "#8A95A3", marginTop: "1px" }}>
            Schedule recurring assessments via <a href="/admin/integrations" style={{ color: "#f8781e" }}>Integrations</a>. Rescans assets on a configured cadence.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
