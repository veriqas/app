"use client";

import { useState, useEffect } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { SCANNER_REGISTRY, type ScannerDefinition } from "@/lib/scanners/registry";
import {
  Shield, Radio, GitBranch, Package, FileCode,
  Network, Cpu, ExternalLink, ChevronRight, Zap, CheckCircle2, XCircle, Loader2,
} from "lucide-react";

type AvailabilityMap = Record<string, { available: boolean; reason: string | null }>;

// â”€â”€ Category metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CATEGORY_META: Record<string, { label: string; icon: unknown; color: string }> = {
  TLS_ANALYSIS:         { label: "TLS & Certificates",   icon: Shield,    color: "#f8781e" },
  SSH_ANALYSIS:         { label: "SSH",                   icon: Radio,     color: "#8B5CF6" },
  CODE_ANALYSIS:        { label: "Source Code",           icon: FileCode,  color: "#10B981" },
  DEPENDENCY_ANALYSIS:  { label: "Dependencies",          icon: Package,   color: "#F59E0B" },
  CBOM:                 { label: "CBOM",                  icon: GitBranch, color: "#6366F1" },
  NETWORK_PASSIVE:      { label: "Network",               icon: Network,   color: "#EF4444" },
  CONTAINER_ANALYSIS:   { label: "Container",             icon: Package,   color: "#6366F1" },
  VULNERABILITY_ANALYSIS:{ label: "Vulnerability",        icon: Shield,    color: "#EF4444" },
  SBOM_ANALYSIS:        { label: "SBOM",                  icon: GitBranch, color: "#F59E0B" },
  NETWORK_DISCOVERY:    { label: "Network Discovery",     icon: Network,   color: "#f8781e" },
  COMPLIANCE_SCAN:      { label: "Compliance",            icon: Shield,    color: "#10B981" },
  SECRET_DETECTION:     { label: "Secret Detection",      icon: FileCode,  color: "#8B5CF6" },
  INFRASTRUCTURE_SCAN:  { label: "Infrastructure",        icon: Network,   color: "#EF4444" },
};

const SOURCE_LABEL: Record<string, string> = {
  ACTIVE_HANDSHAKE:     "Active Handshake",
  STATIC_DETECTION:     "Static Detection",
  DEPENDENCY_INFERENCE: "Dependency Inference",
  CBOM_IMPORT:          "CBOM Import",
  OBSERVED_LIVE:        "Observed Live",
};

const SOURCE_COLOR: Record<string, string> = {
  ACTIVE_HANDSHAKE:     "#f8781e",
  STATIC_DETECTION:     "#F59E0B",
  DEPENDENCY_INFERENCE: "#8B5CF6",
  CBOM_IMPORT:          "#6366F1",
  OBSERVED_LIVE:        "#10B981",
};

const INPUT_LABEL: Record<string, string> = {
  ENDPOINT:    "Endpoints",
  IP_RANGE:    "IP Ranges",
  GIT_REPO:    "Git Repos",
  FILE_UPLOAD: "File Upload",
  DOMAIN:      "Domains",
};

// â”€â”€ Launch modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function LaunchModal({
  scanner,
  onClose,
  onLaunch,
}: {
  scanner: ScannerDefinition;
  onClose: () => void;
  onLaunch: (targets: string[]) => void;
}) {
  const [targets, setTargets] = useState("");
  const [launching, setLaunching] = useState(false);

  const placeholder =
    scanner.inputTypes.includes("GIT_REPO")  ? "https://github.com/org/repo" :
    scanner.inputTypes.includes("IP_RANGE")  ? "10.0.0.0/24 or 192.168.1.1" :
    "payments.northstar.com:443";

  async function handleLaunch() {
    const list = targets.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!list.length) return;
    setLaunching(true);
    try {
      const res = await fetch("/api/scan-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensorType: scanner.sensorType, targets: list }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to start scan");
        return;
      }
      const data = await res.json();
      onLaunch(list);
      onClose();
      // Navigate to jobs page
      window.location.href = `/discovery/scan-jobs?highlight=${data.jobId}`;
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(12,21,36,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${scanner.color}18` }}
          >
            <Zap className="h-5 w-5" style={{ color: scanner.color }} />
          </div>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F1923" }}>
              Run {scanner.displayName}
            </h3>
            <p style={{ fontSize: "12px", color: "#8A95A3", marginTop: "2px" }}>
              {scanner.durationHint} · {SOURCE_LABEL[scanner.evidenceSource]}
            </p>
          </div>
        </div>

        {/* Target input */}
        <label style={{ fontSize: "11px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Targets — {scanner.inputTypes.map(t => INPUT_LABEL[t]).join(" / ")}
        </label>
        <textarea
          className="mt-2 w-full resize-none rounded-xl px-4 py-3 font-mono text-sm outline-none"
          style={{
            border: "1px solid rgba(0,0,0,0.1)",
            background: "#F9FAFB",
            color: "#0F1923",
            fontSize: "13px",
            minHeight: "96px",
          }}
          placeholder={placeholder}
          value={targets}
          onChange={e => setTargets(e.target.value)}
        />
        <p className="mt-1.5" style={{ fontSize: "11px", color: "#8A95A3" }}>
          Separate multiple targets with commas or new lines.
        </p>

        {scanner.requiresApprovedScope && (
          <div
            className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5"
            style={{ background: "#FEF9EC", border: "1px solid #FDE68A" }}
          >
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#D97706" }} />
            <p style={{ fontSize: "11px", color: "#92400E", lineHeight: 1.5 }}>
              This scanner performs active network requests. Targets must be within an approved Scan Scope.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium"
            style={{ color: "#8A95A3", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={!targets.trim() || launching}
            className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-600 transition-opacity"
            style={{
              background: scanner.color,
              color: "#fff",
              fontWeight: 600,
              opacity: (!targets.trim() || launching) ? 0.5 : 1,
            }}
          >
            {launching ? "Launching…" : "Run Scan"}
            {!launching && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Scanner card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatusPill({ status }: { status: "loading" | "available" | "unavailable" | "agent" }) {
  if (status === "loading") return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1"
      style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
      <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#9CA3AF" }} />
      <span style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF" }}>Checking…</span>
    </div>
  );
  if (status === "available") return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1"
      style={{ background: "#DCFCE7", border: "1px solid #86EFAC" }}>
      <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: "#16A34A" }} />
      <span style={{ fontSize: "11px", fontWeight: 700, color: "#15803D" }}>Enabled</span>
    </div>
  );
  if (status === "agent") return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1"
      style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
      <Cpu className="h-3 w-3" style={{ color: "#3B82F6" }} />
      <span style={{ fontSize: "11px", fontWeight: 700, color: "#1D4ED8" }}>Agent only</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1"
      style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <div className="h-2 w-2 rounded-full" style={{ background: "#D1D5DB" }} />
      <span style={{ fontSize: "11px", fontWeight: 700, color: "#9CA3AF" }}>Not enabled</span>
    </div>
  );
}

function ScannerCard({
  scanner,
  onRun,
  availability,
}: {
  scanner: ScannerDefinition;
  onRun: (s: ScannerDefinition) => void;
  availability: AvailabilityMap | null;
}) {
  const catMeta = CATEGORY_META[scanner.category];
  const CatIcon = catMeta.icon;

  const av = availability?.[scanner.sensorType];
  const status: "loading" | "available" | "unavailable" | "agent" =
    !availability ? "loading" :
    !av ? "unavailable" :
    av.reason === "agent" ? "agent" :
    av.available ? "available" : "unavailable";

  const canRun = status === "available";

  return (
    <div
      className="flex flex-col rounded-2xl p-5 transition-shadow hover:shadow-md"
      style={{
        background: "#FFFFFF",
        border: `1px solid ${canRun ? "rgba(71,204,98,0.2)" : "rgba(0,0,0,0.07)"}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        opacity: status === "unavailable" ? 0.65 : 1,
      }}
    >
      {/* Top row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${scanner.color}15` }}
        >
          <CatIcon className="h-5 w-5" style={{ color: scanner.color }} />
        </div>
        <StatusPill status={status} />
      </div>

      {/* Name + description */}
      <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.01em" }}>
        {scanner.displayName}
      </h3>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_COLOR[scanner.evidenceSource] }} />
        <span style={{ fontSize: "10px", fontWeight: 600, color: SOURCE_COLOR[scanner.evidenceSource], letterSpacing: "0.05em" }}>
          {SOURCE_LABEL[scanner.evidenceSource]}
        </span>
      </div>
      <p className="mt-2 flex-1" style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.6 }}>
        {scanner.description}
      </p>

      {/* Meta row */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {scanner.tools.map(t => (
          <span
            key={t}
            className="rounded-md px-2 py-0.5"
            style={{ fontSize: "10px", fontWeight: 600, background: "#F3F4F6", color: "#6B7280", fontFamily: "monospace" }}
          >
            {t}
          </span>
        ))}
        {scanner.inputTypes.map(t => (
          <span
            key={t}
            className="rounded-md px-2 py-0.5"
            style={{ fontSize: "10px", fontWeight: 600, background: `${scanner.color}10`, color: scanner.color }}
          >
            {INPUT_LABEL[t]}
          </span>
        ))}
      </div>

      <p className="mt-2" style={{ fontSize: "11px", color: "#9CA3AF" }}>
        â± {scanner.durationHint}
      </p>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        {scanner.docsUrl && (
          <a
            href={scanner.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs"
            style={{ color: "#9CA3AF" }}
          >
            <ExternalLink className="h-3 w-3" />
            Docs
          </a>
        )}
        <button
          onClick={() => canRun && onRun(scanner)}
          disabled={!canRun}
          title={!canRun && status === "agent" ? "Requires on-premise agent" : !canRun ? "Binary not installed on this server" : undefined}
          className="ml-auto flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all"
          style={{
            background: canRun ? `${scanner.color}15` : "#F3F4F6",
            color: canRun ? scanner.color : "#9CA3AF",
            fontWeight: 600,
            fontSize: "12px",
            cursor: canRun ? "pointer" : "not-allowed",
          }}
        >
          <Zap className="h-3.5 w-3.5" />
          {canRun ? "Run Scan" : status === "agent" ? "Agent Only" : "Not Available"}
        </button>
      </div>
    </div>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SensorsPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [launching, setLaunching] = useState<ScannerDefinition | null>(null);
  const [availability, setAvailability] = useState<AvailabilityMap | null>(null);

  useEffect(() => {
    fetch("/api/scanners/availability")
      .then(r => r.json())
      .then(setAvailability)
      .catch(() => setAvailability({}));
  }, []);

  const categories = Array.from(new Set(SCANNER_REGISTRY.map(s => s.category)));

  const filtered = activeCategory
    ? SCANNER_REGISTRY.filter(s => s.category === activeCategory)
    : SCANNER_REGISTRY;

  return (
    <PageShell
      title="Sensors"
      breadcrumbs={[{ label: "VERIQAS" }, { label: "Discovery" }, { label: "Sensors" }]}
    >
      {launching && (
        <LaunchModal
          scanner={launching}
          onClose={() => setLaunching(null)}
          onLaunch={() => {}}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.02em" }}>
          Scanner Catalogue
        </h1>
        <p className="mt-1" style={{ fontSize: "12px", color: "#8A95A3" }}>
          {availability
            ? `${Object.values(availability).filter(a => a.available).length} of ${SCANNER_REGISTRY.length} scanners ready on this server`
            : `${SCANNER_REGISTRY.length} scanners · checking availability…`}
        </p>
      </div>

      {/* Category filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: !activeCategory ? "#0F1923" : "#F3F4F6",
            color: !activeCategory ? "#fff" : "#6B7280",
          }}
        >
          All scanners
        </button>
        {categories.map(cat => {
          const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
          const Icon = meta.icon;
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(active ? null : cat)}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: active ? meta.color : "#F3F4F6",
                color: active ? "#fff" : "#6B7280",
              }}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Evidence quality legend */}
      <div
        className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-3"
        style={{ background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        <span style={{ fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Evidence quality
        </span>
        {Object.entries(SOURCE_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLOR[key] }} />
            <span style={{ fontSize: "11px", color: "#6B7280" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Scanner grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(scanner => (
          <ScannerCard key={scanner.sensorType} scanner={scanner} onRun={setLaunching} availability={availability} />
        ))}
      </div>
    </PageShell>
  );
}


