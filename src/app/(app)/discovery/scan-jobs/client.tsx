"use client";

import { useState, useTransition, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { Play, X, CheckCircle2, XCircle, Clock, Loader2, Code, Shield, Wifi, RefreshCw, Activity, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScannerDefinition } from "@/lib/scanners/registry";

type Job = {
  id: string;
  ref: string;
  status: string;
  targets: string[];
  resultCount: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  sensor: { name: string; sensorType: string };
  _count: { results: number };
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING:   <Clock className="h-4 w-4 text-slate-400" />,
  RUNNING:   <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  FAILED:    <XCircle className="h-4 w-4 text-red-500" />,
};

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "text-slate-500",
  RUNNING:   "text-blue-600 dark:text-blue-400",
  COMPLETED: "text-green-600 dark:text-green-400",
  FAILED:    "text-red-600 dark:text-red-400",
};

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  CODE_ANALYSIS:       <Code className="h-4 w-4" />,
  DEPENDENCY_ANALYSIS: <Code className="h-4 w-4" />,
  CBOM:                <Code className="h-4 w-4" />,
  TLS_ANALYSIS:        <Shield className="h-4 w-4" />,
  SSH_ANALYSIS:        <Shield className="h-4 w-4" />,
  NETWORK_PASSIVE:     <Wifi className="h-4 w-4" />,
};

// â”€â”€ Worker status banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type WorkerStatus = {
  status: "online" | "idle" | "degraded";
  running: number;
  queued: number;
  stuckCount: number;
  lastCompletedAt: string | null;
  lastWorkerNode: string | null;
};

function WorkerStatusBanner() {
  const [ws, setWs] = useState<WorkerStatus | null>(null);

  useEffect(() => {
    fetch("/api/worker-status")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setWs(d))
      .catch(() => {});
  }, []);

  if (!ws) return null;

  const cfg = {
    online:   { dot: "#f8781e", bg: "#f0fdf4", border: "#bbf7d0", text: "Worker online" },
    idle:     { dot: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", text: "Worker idle"   },
    degraded: { dot: "#f59e0b", bg: "#fffbeb", border: "#fde68a", text: "Worker degraded — check logs" },
  }[ws.status];

  return (
    <div
      className="mb-4 flex items-center justify-between rounded-xl border px-4 py-2.5"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      <div className="flex items-center gap-2.5">
        {ws.status === "degraded"
          ? <AlertTriangle className="h-3.5 w-3.5" style={{ color: cfg.dot }} />
          : <Activity     className="h-3.5 w-3.5" style={{ color: cfg.dot }} />
        }
        <span className="text-sm font-medium" style={{ color: "#0F1923" }}>{cfg.text}</span>
        {ws.running > 0 && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            {ws.running} running
          </span>
        )}
        {ws.queued > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {ws.queued} queued
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {ws.lastCompletedAt && (
          <span className="text-[11px] text-slate-400">
            Last run {new Date(ws.lastCompletedAt).toLocaleTimeString()}
          </span>
        )}
        {ws.lastWorkerNode && (
          <span className="font-mono text-[10px] text-slate-300">{ws.lastWorkerNode}</span>
        )}
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: cfg.dot, boxShadow: ws.status === "online" ? `0 0 6px ${cfg.dot}` : "none" }}
        />
      </div>
    </div>
  );
}

// â”€â”€ New Scan Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CATEGORY_GROUPS: { label: string; categories: string[] }[] = [
  { label: "Source Code & Dependencies", categories: ["CODE_ANALYSIS", "DEPENDENCY_ANALYSIS", "CBOM"] },
  { label: "Network & Endpoints",        categories: ["TLS_ANALYSIS", "SSH_ANALYSIS", "NETWORK_DISCOVERY", "NETWORK_PASSIVE"] },
  { label: "Infrastructure",             categories: ["INFRASTRUCTURE_SCAN", "COMPLIANCE_SCAN"] },
  { label: "Container & Supply Chain",   categories: ["CONTAINER_ANALYSIS", "VULNERABILITY_ANALYSIS", "SBOM_ANALYSIS"] },
  { label: "Secrets",                    categories: ["SECRET_DETECTION"] },
];

function NewScanModal({
  scanners,
  scannerAvailability,
  onClose,
  onLaunched,
}: {
  scanners: ScannerDefinition[];
  scannerAvailability: Record<string, boolean>;
  onClose: () => void;
  onLaunched: (job: Job) => void;
}) {
  const [selected, setSelected] = useState<ScannerDefinition | null>(null);
  const [target, setTarget] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleLaunch() {
    if (!selected) { setError("Select a scanner."); return; }
    if (!target.trim()) { setError("Enter a target."); return; }
    setError("");

    startTransition(async () => {
      const res = await fetch("/api/scan-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensorType: selected.sensorType, targets: [target.trim()] }),
      });
      if (res.ok) {
        const data = await res.json();
        onLaunched(data);
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to launch scan.");
      }
    });
  }

  const targetPlaceholder =
    selected?.inputTypes.includes("GIT_REPO")        ? "https://github.com/org/repo" :
    selected?.inputTypes.includes("ENDPOINT")         ? "api.example.com:443" :
    selected?.inputTypes.includes("IP_RANGE")         ? "10.0.0.0/24" :
    selected?.inputTypes.includes("CONTAINER_IMAGE")  ? "nginx:latest" :
    selected?.inputTypes.includes("KUBERNETES")       ? "https://k8s-api.example.com" :
    "Enter target…";

  const isAvailable = selected ? (scannerAvailability[selected.sensorType] ?? false) : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Launch Scan</p>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Scanner dropdown */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Scanner
            </label>
            <select
              value={selected?.sensorType ?? ""}
              onChange={(e) => {
                const s = scanners.find(s => s.sensorType === e.target.value) ?? null;
                setSelected(s);
                setTarget("");
                setError("");
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">— Select a scanner —</option>
              {CATEGORY_GROUPS.map((group) => {
                const groupScanners = scanners.filter(s => group.categories.includes(s.category));
                if (groupScanners.length === 0) return null;
                return (
                  <optgroup key={group.label} label={group.label}>
                    {groupScanners.map((s) => {
                      const avail = scannerAvailability[s.sensorType] ?? false;
                      return (
                        <option key={s.sensorType} value={s.sensorType} disabled={!avail}>
                          {avail ? "âœ“" : "âœ—"} {s.displayName}{!avail ? " (not installed)" : ""}
                        </option>
                      );
                    })}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Selected scanner info */}
          {selected && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs ${
              isAvailable
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{ color: selected.color }}>{CATEGORY_ICON[selected.category]}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{selected.displayName}</span>
                {isAvailable
                  ? <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900 dark:text-green-300">Ready</span>
                  : <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">Not installed</span>
                }
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{selected.description}</p>
              <p className="mt-1 text-slate-400 dark:text-slate-500">{selected.durationHint} · {selected.inputTypes.join(", ")}</p>
            </div>
          )}

          {/* Target */}
          {selected && isAvailable && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Target
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLaunch()}
                placeholder={targetPlaceholder}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              {selected.inputTypes.includes("GIT_REPO") && (
                <p className="mt-1 text-[10px] text-slate-400">
                  Public GitHub repos are cloned locally and scanned. No credentials required.
                </p>
              )}
              {selected.requiresApprovedScope && (
                <p className="mt-1 text-[10px] text-amber-500">Requires approved scope before running.</p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleLaunch} disabled={isPending || !selected || !isAvailable || !target.trim()}>
            {isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Launching…</> : <><Play className="h-3.5 w-3.5" /> Launch Scan</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Main client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ScanJobsClient({
  jobs: initialJobs,
  scanners,
  scannerAvailability,
}: {
  jobs: Job[];
  scanners: ScannerDefinition[];
  scannerAvailability: Record<string, boolean>;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [modalOpen, setModalOpen] = useState(false);
  const [polling, setPolling] = useState(false);

  // Poll while any job is RUNNING or PENDING
  const hasActive = jobs.some((j) => j.status === "RUNNING" || j.status === "PENDING");

  useEffect(() => {
    if (!hasActive) return;
    setPolling(true);
    const interval = setInterval(async () => {
      const res = await fetch("/api/scan-jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
        const stillActive = (data.jobs ?? []).some((j: Job) => j.status === "RUNNING" || j.status === "PENDING");
        if (!stillActive) { clearInterval(interval); setPolling(false); }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [hasActive]);

  function onLaunched(data: { jobId: string; ref: string; status: string }) {
    // Optimistic stub — will be replaced by the next poll
    const stub: Job = {
      id: data.jobId,
      ref: data.ref,
      status: data.status,
      targets: [],
      resultCount: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sensor: { name: "Scanner", sensorType: "" },
      _count: { results: 0 },
    } as unknown as Job;
    setJobs((prev) => [stub, ...prev]);
  }

  const running = jobs.filter((j) => j.status === "RUNNING").length;
  const completed = jobs.filter((j) => j.status === "COMPLETED").length;
  const failed = jobs.filter((j) => j.status === "FAILED").length;
  const totalFindings = jobs.reduce((acc, j) => acc + (j.resultCount ?? 0), 0);

  return (
    <>
      <WorkerStatusBanner />

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          { label: "Total Jobs", value: jobs.length, color: "text-slate-700 dark:text-slate-200" },
          { label: "Running", value: running, color: "text-blue-600" },
          { label: "Completed", value: completed, color: "text-green-600" },
          { label: "Total Findings", value: totalFindings.toLocaleString(), color: "text-green-600" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={`mt-0.5 text-2xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Scan Jobs</CardTitle>
            {polling && (
              <span className="flex items-center gap-1 text-xs text-blue-500">
                <RefreshCw className="h-3 w-3 animate-spin" /> Polling…
              </span>
            )}
            <div className="ml-auto">
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Play className="h-3.5 w-3.5" />
                Launch Scan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <div className="py-16 text-center">
              <Shield className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">No scans yet — launch one to start discovering crypto assets</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs.map((job) => {
                const duration =
                  job.startedAt && job.completedAt
                    ? Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
                    : null;

                return (
                  <div key={job.id} className="flex items-center gap-4 px-5 py-3.5">
                    {/* Status icon */}
                    <div className="shrink-0">{STATUS_ICON[job.status] ?? STATUS_ICON.PENDING}</div>

                    {/* Scanner + target */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {job.sensor.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">{job.ref}</span>
                        <span className={`text-xs font-medium ${STATUS_COLORS[job.status] ?? ""}`}>
                          {job.status}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                        {job.targets.join(", ") || "—"}
                      </p>
                      {job.errorMessage && (
                        <p className="mt-0.5 truncate text-[10px] text-red-500">{job.errorMessage}</p>
                      )}
                    </div>

                    {/* Findings count + link */}
                    <div className="shrink-0 text-right">
                      {job.status === "COMPLETED" && (
                        <a
                          href={`/discovery/observations?scanJobId=${job.id}`}
                          className="group block"
                        >
                          <p className="text-sm font-semibold text-green-600 group-hover:underline dark:text-indigo-400">
                            {(job.resultCount ?? job._count.results).toLocaleString()}
                            <span className="ml-1 text-[10px] font-normal text-slate-400">findings</span>
                          </p>
                          <p className="text-[10px] text-indigo-400 group-hover:underline">View observations â†’</p>
                        </a>
                      )}
                      {job.status === "RUNNING" && (
                        <span className="text-xs text-blue-500">Scanning…</span>
                      )}
                    </div>

                    {/* Duration + date */}
                    <div className="w-28 shrink-0 text-right">
                      {duration !== null && (
                        <p className="text-xs text-slate-400">{duration}s</p>
                      )}
                      <p className="text-[10px] text-slate-300 dark:text-slate-600">
                        {formatDate(new Date(job.createdAt))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {modalOpen && (
        <NewScanModal
          scanners={scanners}
          scannerAvailability={scannerAvailability}
          onClose={() => setModalOpen(false)}
          onLaunched={onLaunched}
        />
      )}
    </>
  );
}
