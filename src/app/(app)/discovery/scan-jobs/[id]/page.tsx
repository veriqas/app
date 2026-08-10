"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import Link from "next/link";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Clock,
  AlertTriangle, Shield, ShieldAlert, ShieldCheck, ShieldOff,
  FileCode, Server, Package, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

interface Observation {
  id: string;
  algorithm: string | null;
  primitiveType: string | null;
  quantumClass: string | null;
  evidenceSource: string | null;
  endpoint: string | null;
  filePath: string | null;
  packageName: string | null;
  confidence: number | null;
  observedAt: string;
}

interface ScanJobDetail {
  id: string;
  ref: string;
  status: JobStatus;
  targets: string[];
  resultCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  sensor: { name: string; sensorType: string } | null;
  results: Observation[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  PENDING:   { label: "Pending",   color: "#F59E0B", icon: Clock },
  RUNNING:   { label: "Running",   color: "#f8781e", icon: Loader2 },
  COMPLETED: { label: "Completed", color: "#10B981", icon: CheckCircle2 },
  FAILED:    { label: "Failed",    color: "#EF4444", icon: XCircle },
  CANCELLED: { label: "Cancelled", color: "#9CA3AF", icon: XCircle },
};

const SCANNER_COLORS: Record<string, string> = {
  SSLYZE:    "#f8781e",
  SSH_AUDIT: "#8B5CF6",
  ZGRAB2:    "#F97316",
  CRYPTOSCAN:"#10B981",
  CRYPTODEPS:"#F59E0B",
  SEMGREP:   "#EC4899",
  CBOMKIT:   "#6366F1",
  ZEEK:      "#EF4444",
};

const QUANTUM_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  POST_QUANTUM:             { label: "Post-Quantum",        color: "#10B981", icon: ShieldCheck },
  QUANTUM_RESILIENT:        { label: "Resilient",           color: "#3B82F6", icon: Shield },
  QUANTUM_REDUCED_SECURITY: { label: "Reduced Security",    color: "#F59E0B", icon: ShieldAlert },
  QUANTUM_VULNERABLE:       { label: "Vulnerable",          color: "#EF4444", icon: ShieldOff },
  UNKNOWN:                  { label: "Unknown",             color: "#9CA3AF", icon: AlertTriangle },
};

const PRIM_LABELS: Record<string, string> = {
  KEY_ESTABLISHMENT:    "Key Est.",
  DIGITAL_SIGNATURE:    "Sig.",
  PUBLIC_KEY_ENCRYPTION:"PKE",
  SYMMETRIC_ENCRYPTION: "Sym.",
  HASH:                 "Hash",
  MAC:                  "MAC",
  KDF:                  "KDF",
  CERTIFICATE:          "Cert",
  OTHER:                "Other",
};

const EVIDENCE_LABELS: Record<string, string> = {
  ACTIVE_HANDSHAKE:     "Handshake",
  STATIC_DETECTION:     "Static",
  DEPENDENCY_INFERENCE: "Deps",
  CBOM_IMPORT:          "CBOM",
  OBSERVED_LIVE:        "Live",
  CONFIGURATION:        "Config",
};

function confidenceColor(c: number) {
  if (c >= 85) return "#10B981";
  if (c >= 65) return "#3B82F6";
  if (c >= 45) return "#F59E0B";
  return "#EF4444";
}

function elapsed(from: string, to: string | null) {
  const ms = new Date(to ?? Date.now()).getTime() - new Date(from).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function locationLabel(obs: Observation) {
  if (obs.endpoint) return obs.endpoint;
  if (obs.filePath) return obs.filePath.split(/[\\/]/).slice(-2).join("/");
  if (obs.packageName) return obs.packageName;
  return "—";
}

function locationIcon(obs: Observation) {
  if (obs.endpoint) return Server;
  if (obs.filePath) return FileCode;
  return Package;
}

// ── Components ────────────────────────────────────────────────────────────────

function JobMeta({ job, accentColor }: { job: ScanJobDetail; accentColor: string }) {
  const cfg = STATUS_CONFIG[job.status];
  const Icon = cfg.icon;
  const duration = job.startedAt ? elapsed(job.startedAt, job.completedAt) : null;

  return (
    <div
      className="mb-6 rounded-2xl p-5"
      style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
    >
      <div className="flex flex-wrap items-start gap-6">
        {/* Scanner + ref */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold text-xs"
            style={{ background: accentColor }}
          >
            {(job.sensor?.sensorType ?? "?").slice(0, 2)}
          </div>
          <div>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#0F1923" }}>
              {job.sensor?.name ?? "Unknown Scanner"}
            </p>
            <p style={{ fontSize: "11px", color: "#8A95A3", fontFamily: "monospace" }}>
              {job.ref}
            </p>
          </div>
        </div>

        {/* Status */}
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2"
          style={{ background: `${cfg.color}12`, border: `1px solid ${cfg.color}25` }}
        >
          <Icon
            className={`h-4 w-4 ${job.status === "RUNNING" ? "animate-spin" : ""}`}
            style={{ color: cfg.color }}
          />
          <span style={{ fontSize: "13px", fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
        </div>

        {/* Stats */}
        {[
          { label: "Observations", value: job.resultCount?.toLocaleString() ?? "—" },
          { label: "Targets",      value: job.targets.length.toString() },
          ...(duration ? [{ label: "Duration", value: duration }] : []),
        ].map(stat => (
          <div key={stat.label}>
            <p style={{ fontSize: "11px", color: "#8A95A3", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              {stat.label}
            </p>
            <p style={{ fontSize: "18px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.01em" }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Targets */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {job.targets.map((t, i) => (
          <span
            key={i}
            className="rounded-lg px-2.5 py-1"
            style={{ fontSize: "11px", fontFamily: "monospace", background: `${accentColor}10`, color: accentColor, border: `1px solid ${accentColor}20` }}
          >
            {t}
          </span>
        ))}
      </div>

      {job.errorMessage && (
        <div
          className="mt-4 rounded-lg px-4 py-3"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
        >
          <p style={{ fontSize: "12px", color: "#DC2626", fontFamily: "monospace" }}>
            {job.errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

function FindingsTable({ observations }: { observations: Observation[] }) {
  const [qFilter, setQFilter] = useState<string | null>(null);

  const filtered = qFilter ? observations.filter(o => o.quantumClass === qFilter) : observations;

  const qCounts = observations.reduce<Record<string, number>>((acc, o) => {
    const k = o.quantumClass ?? "UNKNOWN";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
    >
      {/* Table header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#0F1923" }}>
          Cryptographic Observations
          <span className="ml-2" style={{ color: "#8A95A3", fontWeight: 500 }}>({filtered.length})</span>
        </h2>

        {/* Quantum filter pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setQFilter(null)}
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: !qFilter ? "#0F1923" : "#F3F4F6", color: !qFilter ? "#fff" : "#6B7280" }}
          >
            All
          </button>
          {Object.entries(QUANTUM_CONFIG).map(([key, cfg]) => {
            const count = qCounts[key] ?? 0;
            if (!count) return null;
            const active = qFilter === key;
            return (
              <button
                key={key}
                onClick={() => setQFilter(active ? null : key)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{
                  background: active ? cfg.color : `${cfg.color}12`,
                  color: active ? "#fff" : cfg.color,
                }}
              >
                {cfg.label}
                <span className="rounded-full px-1" style={{ background: active ? "rgba(255,255,255,0.25)" : `${cfg.color}20`, fontSize: "10px" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Column headers */}
      <div
        className="grid px-5 py-2"
        style={{
          gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr 60px",
          fontSize: "10px", fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <span>Algorithm</span>
        <span>Primitive</span>
        <span>Quantum Risk</span>
        <span>Evidence</span>
        <span>Location</span>
        <span style={{ textAlign: "right" }}>Conf.</span>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ divideColor: "rgba(0,0,0,0.04)" }}>
        {filtered.map(obs => {
          const qcfg = QUANTUM_CONFIG[obs.quantumClass ?? "UNKNOWN"];
          const QIcon = qcfg.icon;
          const LocIcon = locationIcon(obs);

          return (
            <div
              key={obs.id}
              className="grid items-center px-5 py-3"
              style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr 60px" }}
            >
              {/* Algorithm */}
              <p style={{ fontSize: "12px", fontWeight: 600, color: "#0F1923", fontFamily: "monospace" }}>
                {obs.algorithm ?? "—"}
              </p>

              {/* Primitive */}
              <span
                className="inline-block rounded px-1.5 py-0.5 w-fit"
                style={{ fontSize: "10px", fontWeight: 700, background: "#F3F4F6", color: "#6B7280" }}
              >
                {PRIM_LABELS[obs.primitiveType ?? ""] ?? obs.primitiveType ?? "—"}
              </span>

              {/* Quantum */}
              <div className="flex items-center gap-1.5">
                <QIcon className="h-3 w-3 shrink-0" style={{ color: qcfg.color }} />
                <span style={{ fontSize: "11px", color: qcfg.color, fontWeight: 600 }}>
                  {qcfg.label}
                </span>
              </div>

              {/* Evidence */}
              <span
                className="inline-block rounded px-1.5 py-0.5 w-fit"
                style={{ fontSize: "10px", fontWeight: 600, background: "rgba(71,204,98,0.1)", color: "#f8781e" }}
              >
                {EVIDENCE_LABELS[obs.evidenceSource ?? ""] ?? obs.evidenceSource ?? "—"}
              </span>

              {/* Location */}
              <div className="flex items-center gap-1.5 min-w-0">
                <LocIcon className="h-3 w-3 shrink-0" style={{ color: "#9CA3AF" }} />
                <span className="truncate" style={{ fontSize: "11px", color: "#6B7280", fontFamily: "monospace" }}>
                  {locationLabel(obs)}
                </span>
              </div>

              {/* Confidence */}
              <div className="flex items-center justify-end gap-1.5">
                <div
                  className="h-1.5 w-10 rounded-full overflow-hidden"
                  style={{ background: "#F3F4F6" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${obs.confidence ?? 0}%`, background: confidenceColor(obs.confidence ?? 0) }}
                  />
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: confidenceColor(obs.confidence ?? 0), minWidth: "28px", textAlign: "right" }}>
                  {obs.confidence ?? "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScanJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<ScanJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/scan-jobs/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setJob(data.job);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Auto-poll while running
  useEffect(() => {
    if (job?.status === "RUNNING" || job?.status === "PENDING") {
      intervalRef.current = setInterval(fetchJob, 2000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [job?.status, fetchJob]);

  const accentColor = SCANNER_COLORS[job?.sensor?.sensorType ?? ""] ?? "#8A95A3";

  if (loading) {
    return (
      <PageShell title="Scan Job" breadcrumbs={[{ label: "Discovery" }, { label: "Scan Jobs" }, { label: "Loading…" }]}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#f8781e" }} />
        </div>
      </PageShell>
    );
  }

  if (!job) {
    return (
      <PageShell title="Not Found" breadcrumbs={[{ label: "Discovery" }, { label: "Scan Jobs" }]}>
        <p style={{ color: "#8A95A3" }}>Job not found.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={job.ref}
      breadcrumbs={[
        { label: "VERIQAS" },
        { label: "Discovery" },
        { label: "Scan Jobs", href: "/discovery/scan-jobs" },
        { label: job.ref },
      ]}
    >
      {/* Back link */}
      <Link
        href="/discovery/scan-jobs"
        className="mb-5 flex w-fit items-center gap-1.5 text-xs font-semibold"
        style={{ color: "#8A95A3" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Scan Jobs
      </Link>

      {/* Job metadata */}
      <JobMeta job={job} accentColor={accentColor} />

      {/* Findings */}
      {job.results.length > 0 ? (
        <FindingsTable observations={job.results} />
      ) : job.status === "RUNNING" || job.status === "PENDING" ? (
        <div
          className="flex items-center justify-center gap-3 rounded-2xl py-14"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)" }}
        >
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#f8781e" }} />
          <p style={{ fontSize: "13px", color: "#8A95A3" }}>Scan running — results will appear here…</p>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-14"
          style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)" }}
        >
          <p style={{ fontSize: "13px", color: "#8A95A3" }}>No observations recorded for this job.</p>
        </div>
      )}
    </PageShell>
  );
}
