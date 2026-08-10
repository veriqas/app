"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Bot, CheckCircle, XCircle, RefreshCw, AlertTriangle, FileCode, Cpu, ChevronRight } from "lucide-react";

interface RemediationJob {
  id: string;
  ref: string;
  repoUrl: string;
  filePath: string;
  algorithm: string;
  suggestedAlgorithm: string | null;
  status: string;
  agentReasoning: string | null;
  diffPatch: string | null;
  originalContent: string | null;
  patchedContent: string | null;
  errorMessage: string | null;
  requestedByName: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  PENDING:  { label: "Pending",     color: "#6B7280", bg: "#F3F4F6", icon: RefreshCw },
  RUNNING:  { label: "Agent Running", color: "#D97706", bg: "#FEF3C7", icon: Cpu },
  REVIEW:   { label: "Ready for Review", color: "#2563EB", bg: "#DBEAFE", icon: FileCode },
  APPROVED: { label: "Approved",    color: "#16A34A", bg: "#DCFCE7", icon: CheckCircle },
  REJECTED: { label: "Rejected",    color: "#DC2626", bg: "#FEE2E2", icon: XCircle },
  APPLIED:  { label: "Applied",     color: "#7C3AED", bg: "#EDE9FE", icon: CheckCircle },
  FAILED:   { label: "Failed",      color: "#DC2626", bg: "#FEE2E2", icon: AlertTriangle },
};

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return <div className="px-3 py-0.5 font-mono text-[11px] text-slate-400">{line}</div>;
  }
  if (line.startsWith("@@")) {
    return <div className="px-3 py-1 font-mono text-[11px] text-blue-500 bg-blue-50">{line}</div>;
  }
  if (line.startsWith("+")) {
    return <div className="px-3 py-0.5 font-mono text-[12px] bg-green-50 text-green-800 whitespace-pre">{line}</div>;
  }
  if (line.startsWith("-")) {
    return <div className="px-3 py-0.5 font-mono text-[12px] bg-red-50 text-red-800 whitespace-pre line-through opacity-70">{line}</div>;
  }
  return <div className="px-3 py-0.5 font-mono text-[12px] text-slate-600 whitespace-pre">{line}</div>;
}

export default function RemediationReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<RemediationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [view, setView] = useState<"diff" | "original" | "patched">("diff");

  const load = useCallback(async () => {
    const res = await fetch(`/api/remediation/${id}`);
    if (res.ok) setJob(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    // Poll while running
    const interval = setInterval(() => {
      if (job?.status === "RUNNING" || job?.status === "PENDING") load();
    }, 3000);
    return () => clearInterval(interval);
  }, [load, job?.status]);

  const act = async (action: "run" | "approve" | "reject") => {
    setActing(true);
    await fetch(`/api/remediation/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    setActing(false);
  };

  if (loading) return (
    <PageShell title="AI Remediation" breadcrumbs={[{ label: "Discovery" }, { label: "Observations", href: "/discovery/observations" }, { label: "Remediation" }]}>
      <div className="flex items-center gap-3 text-slate-400 py-12">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading job…</span>
      </div>
    </PageShell>
  );

  if (!job) return (
    <PageShell title="AI Remediation" breadcrumbs={[{ label: "Remediation" }]}>
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">Job not found.</div>
    </PageShell>
  );

  const meta = STATUS_META[job.status] ?? STATUS_META.PENDING;
  const StatusIcon = meta.icon;
  const diffLines = job.diffPatch?.split("\n") ?? [];
  const addedLines = diffLines.filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
  const removedLines = diffLines.filter(l => l.startsWith("-") && !l.startsWith("---")).length;

  return (
    <PageShell
      title="AI Agent Remediation"
      breadcrumbs={[
        { label: "Discovery" },
        { label: "Observations", href: "/discovery/observations" },
        { label: job.ref },
      ]}
    >
      <div className="space-y-5 max-w-5xl">

        {/* Header card */}
        <div className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #0C1524 0%, #1a2f4a 100%)" }}>
                <Bot className="h-5 w-5" style={{ color: "#f8781e" }} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs text-slate-400 font-mono">{job.ref}</code>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ color: meta.color, background: meta.bg }}>
                    <StatusIcon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 font-semibold text-slate-800" style={{ fontSize: "15px" }}>
                  Remediate <span style={{ color: "#f8781e" }}>{job.algorithm}</span> in{" "}
                  <code className="text-sm text-slate-600">{job.filePath.split("/").pop()}</code>
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {job.repoUrl} <ChevronRight className="inline h-3 w-3" /> {job.filePath}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              {job.status === "PENDING" && (
                <button
                  onClick={() => act("run")}
                  disabled={acting}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
                  style={{ background: "#f8781e" }}
                >
                  <Bot className="h-4 w-4" />
                  Run Agent
                </button>
              )}
              {job.status === "RUNNING" && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50">
                  <Cpu className="h-4 w-4 animate-pulse" />
                  Agent working…
                </div>
              )}
              {job.status === "REVIEW" && (
                <>
                  <button
                    onClick={() => act("reject")}
                    disabled={acting}
                    className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => act("approve")}
                    disabled={acting}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
                    style={{ background: "#16a34a" }}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approve Changes
                  </button>
                </>
              )}
              {(job.status === "APPROVED" || job.status === "REJECTED") && (
                <button
                  onClick={() => router.back()}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Back to Observations
                </button>
              )}
            </div>
          </div>

          {/* Suggested replacement */}
          {job.suggestedAlgorithm && (
            <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "rgba(248,120,30,0.06)", border: "1px solid rgba(248,120,30,0.2)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#f8781e" }}>Suggested Replacement</p>
              <p className="mt-0.5 text-sm text-slate-700">{job.suggestedAlgorithm}</p>
            </div>
          )}

          {/* Agent reasoning */}
          {job.agentReasoning && (
            <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Agent Reasoning</p>
              <p className="text-sm text-slate-600 leading-relaxed">{job.agentReasoning}</p>
            </div>
          )}

          {/* Error */}
          {job.errorMessage && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {job.errorMessage}
            </div>
          )}
        </div>

        {/* Approval notice */}
        {job.status === "APPROVED" && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4">
            <p className="font-semibold text-green-800 text-sm">Changes approved — ready to apply</p>
            <p className="text-sm text-green-700 mt-1">
              The patch has been approved. To apply: copy the patched content below, create a branch in your repository,
              commit the changes, and open a pull request for team review before merging.
            </p>
          </div>
        )}

        {job.status === "REJECTED" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="font-semibold text-red-800 text-sm">Changes rejected</p>
            <p className="text-sm text-red-700 mt-1">
              The suggested patch was rejected. Return to the observation and run a new remediation job, or address the issue manually.
            </p>
          </div>
        )}

        {/* Diff viewer */}
        {(job.diffPatch || job.originalContent) && (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Code Changes</p>
                {job.diffPatch && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-green-600">+{addedLines}</span>
                    <span className="font-semibold text-red-500">−{removedLines}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
                {(["diff", "original", "patched"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                    style={view === v
                      ? { background: "#0C1524", color: "#fff" }
                      : { color: "#6B7280" }
                    }
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto bg-slate-50">
              {view === "diff" && job.diffPatch && (
                <div>
                  {diffLines.map((line, i) => <DiffLine key={i} line={line} />)}
                </div>
              )}
              {view === "original" && job.originalContent && (
                <pre className="px-4 py-3 text-[12px] font-mono text-slate-700 whitespace-pre leading-relaxed">{job.originalContent}</pre>
              )}
              {view === "patched" && job.patchedContent && (
                <pre className="px-4 py-3 text-[12px] font-mono text-slate-700 whitespace-pre leading-relaxed">{job.patchedContent}</pre>
              )}
              {!job.diffPatch && !job.originalContent && (
                <div className="px-5 py-8 text-sm text-slate-400 text-center">
                  {job.status === "RUNNING" ? "Agent is generating patch…" : "No patch available yet."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sandbox notice */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Sandboxed — Review before deploying</p>
              <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                The AI agent clones the repository into an isolated temporary environment, reads only the affected file,
                and generates a suggested patch. No changes are written to your repository automatically.
                Always review the diff and have a second engineer validate before applying to production.
              </p>
            </div>
          </div>
        </div>

      </div>
    </PageShell>
  );
}
