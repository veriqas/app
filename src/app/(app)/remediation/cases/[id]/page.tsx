import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { isV2Enabled } from "@/lib/remediation/feature-flag";
import { formatDateTime } from "@/lib/utils";
import { CaseActions } from "@/components/remediation/case-actions";
import {
  Bot, ShieldCheck, ShieldAlert, FileCode2, GitBranch, ChevronRight,
  CircleDot, CheckCircle2, XCircle, MinusCircle, ArrowRight, Layers,
} from "lucide-react";

export const dynamic = "force-dynamic";

const CASE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:        { label: "Open",         color: "#6B7280", bg: "#F3F4F6" },
  PLANNED:     { label: "Planned",      color: "#2563EB", bg: "#DBEAFE" },
  IN_PROGRESS: { label: "In Progress",  color: "#D97706", bg: "#FEF3C7" },
  VERIFIED:    { label: "Verified",     color: "#16A34A", bg: "#DCFCE7" },
  FAILED:      { label: "Failed",       color: "#DC2626", bg: "#FEE2E2" },
  DISMISSED:   { label: "Dismissed",    color: "#8A95A3", bg: "#F5F5F7" },
};

const ATTEMPT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:                 { label: "Pending",       color: "#6B7280", bg: "#F3F4F6" },
  INVESTIGATING:           { label: "Investigating", color: "#D97706", bg: "#FEF3C7" },
  PLANNING:                { label: "Planning",      color: "#D97706", bg: "#FEF3C7" },
  PATCHING:                { label: "Patching",      color: "#D97706", bg: "#FEF3C7" },
  VERIFYING:               { label: "Verifying",     color: "#2563EB", bg: "#DBEAFE" },
  REVIEW:                  { label: "Ready for Review", color: "#2563EB", bg: "#DBEAFE" },
  VERIFIED:                { label: "Verified",      color: "#16A34A", bg: "#DCFCE7" },
  VERIFIED_WITH_WARNINGS:  { label: "Verified (warnings)", color: "#65A30D", bg: "#ECFCCB" },
  FAILED:                  { label: "Failed",        color: "#DC2626", bg: "#FEE2E2" },
  REGRESSED:               { label: "Regressed",     color: "#DC2626", bg: "#FEE2E2" },
  ERROR:                   { label: "Error",         color: "#DC2626", bg: "#FEE2E2" },
  ABANDONED:               { label: "Abandoned",     color: "#8A95A3", bg: "#F5F5F7" },
};

const VERDICT: Record<string, { label: string; color: string; bg: string; good: boolean }> = {
  VERIFIED:               { label: "Verified",             color: "#16A34A", bg: "#DCFCE7", good: true },
  VERIFIED_WITH_WARNINGS: { label: "Verified with warnings", color: "#65A30D", bg: "#ECFCCB", good: true },
  FAILED:                 { label: "Failed",               color: "#DC2626", bg: "#FEE2E2", good: false },
  REGRESSED:              { label: "Regressed",            color: "#DC2626", bg: "#FEE2E2", good: false },
  BUILD_FAILED:           { label: "Build failed",         color: "#DC2626", bg: "#FEE2E2", good: false },
  TEST_FAILED:            { label: "Test failed",          color: "#DC2626", bg: "#FEE2E2", good: false },
  SCAN_FAILED:            { label: "Scan failed",          color: "#DC2626", bg: "#FEE2E2", good: false },
  TIMEOUT:                { label: "Timed out",            color: "#DC2626", bg: "#FEE2E2", good: false },
  NO_BASELINE:            { label: "No baseline",          color: "#8A95A3", bg: "#F5F5F7", good: false },
};

const STAGE_ORDER = ["INVESTIGATOR", "ROOT_CAUSE", "PLANNER", "PATCHER", "DIAGNOSER"] as const;
const STAGE_LABEL: Record<string, string> = {
  INVESTIGATOR: "Investigate",
  ROOT_CAUSE:   "Root Cause",
  PLANNER:      "Plan",
  PATCHER:      "Patch",
  DIAGNOSER:    "Diagnose",
};

function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
      {lines.map((line, i) => {
        if (line.startsWith("+++") || line.startsWith("---"))
          return <div key={i} className="px-3 py-0.5 font-mono text-[11px] text-slate-400">{line}</div>;
        if (line.startsWith("@@"))
          return <div key={i} className="bg-blue-50 px-3 py-1 font-mono text-[11px] text-blue-500">{line}</div>;
        if (line.startsWith("+"))
          return <div key={i} className="whitespace-pre bg-green-50 px-3 py-0.5 font-mono text-[12px] text-green-800">{line}</div>;
        if (line.startsWith("-"))
          return <div key={i} className="whitespace-pre bg-red-50 px-3 py-0.5 font-mono text-[12px] text-red-800 line-through opacity-70">{line}</div>;
        return <div key={i} className="whitespace-pre px-3 py-0.5 font-mono text-[12px] text-slate-600">{line}</div>;
      })}
    </div>
  );
}

export default async function RemediationCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  if (!isV2Enabled()) notFound();

  const c = await db.remediationCase.findFirst({
    where: { id, tenantId },
    include: {
      findings: {
        include: {
          observation: {
            select: { ref: true, algorithm: true, filePath: true, endpoint: true, quantumClass: true },
          },
        },
      },
      attempts: {
        orderBy: { attemptNumber: "asc" },
        include: {
          stageResults: { orderBy: { createdAt: "asc" } },
          changes: true,
        },
      },
      verificationRuns: {
        orderBy: { createdAt: "desc" },
        include: { findings: true, scannerResults: true },
      },
    },
  });

  if (!c) notFound();

  const meta = CASE_STATUS[c.status] ?? CASE_STATUS.OPEN;
  const latestAttempt = c.attempts[c.attempts.length - 1];
  const canRemediate = c.attempts.length < 3 && !["VERIFIED", "DISMISSED"].includes(c.status);

  return (
    <PageShell
      title="Remediation Case"
      breadcrumbs={[
        { label: "Governance" },
        { label: "Remediation Center", href: "/remediation" },
        { label: c.ref },
      ]}
    >
      <div className="max-w-5xl space-y-5">

        {/* ── Overview ── */}
        <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #0C1524 0%, #1a2f4a 100%)" }}>
                <Layers className="h-5 w-5" style={{ color: "#f8781e" }} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs font-mono text-slate-400">{c.ref}</code>
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                  {c.algorithm && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ color: "#f8781e", background: "rgba(248,120,30,0.08)" }}>{c.algorithm}</span>
                  )}
                </div>
                <h2 className="mt-1.5 font-semibold text-slate-800" style={{ fontSize: "16px" }}>{c.title}</h2>
                {c.repoUrl && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {c.repoUrl}{c.purpose ? <> <ChevronRight className="inline h-3 w-3" /> {c.purpose}</> : null}
                  </p>
                )}
              </div>
            </div>
            <CaseActions caseId={c.id} canRemediate={canRemediate} attemptsUsed={c.attempts.length} caseStatus={c.status} />
          </div>

          {(c.rootCause || c.securityImpact) && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {c.rootCause && (
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Root Cause</p>
                  <p className="text-sm leading-relaxed text-slate-600">{c.rootCause}</p>
                </div>
              )}
              {c.securityImpact && (
                <div className="rounded-xl px-4 py-3" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-red-500">Security Impact</p>
                  <p className="text-sm leading-relaxed text-slate-600">{c.securityImpact}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span><span className="font-semibold text-slate-700">{c.confidence}%</span> confidence</span>
            <span><span className="font-semibold text-slate-700">{c.findingCount}</span> findings</span>
            {c.evidenceSources.length > 0 && (
              <span className="flex items-center gap-1.5">
                Evidence:
                {c.evidenceSources.map(s => (
                  <span key={s} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{s}</span>
                ))}
              </span>
            )}
          </div>

          {c.affectedFiles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.affectedFiles.map(f => (
                <span key={f} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-mono text-slate-500">
                  <FileCode2 className="h-3 w-3" />{f}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── Correlated findings ── */}
        <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Correlated Findings</h3>
            <span className="text-xs text-slate-400">({c.findings.length})</span>
          </div>
          <div className="divide-y divide-slate-100">
            {c.findings.map(f => (
              <div key={f.observationId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-slate-400">{f.observation?.ref}</span>{" "}
                  <span className="text-slate-700">{f.observation?.algorithm ?? c.algorithm}</span>
                  <span className="ml-2 truncate text-xs text-slate-400">
                    {f.observation?.filePath ?? f.observation?.endpoint}
                  </span>
                </div>
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{f.sensorType}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Staged Audit Trail ── */}
        <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4" style={{ color: "#f8781e" }} />
            <h3 className="text-sm font-semibold text-slate-700">Staged AI Audit Trail</h3>
          </div>

          {c.attempts.length === 0 ? (
            <p className="text-sm text-slate-400">
              No AI remediation attempts yet. Run the staged remediation loop to investigate, plan, patch and verify.
            </p>
          ) : (
            <div className="space-y-5">
              {c.attempts.map(a => {
                const am = ATTEMPT_STATUS[a.status] ?? ATTEMPT_STATUS.PENDING;
                const doneStages = new Set(a.stageResults.map(s => s.stage));
                return (
                  <div key={a.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">Attempt {a.attemptNumber}</span>
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{ color: am.color, background: am.bg }}>{am.label}</span>
                        {a.strategy && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{a.strategy}</span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-slate-300">{a.ref}</span>
                    </div>

                    {/* Stage pipeline */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {STAGE_ORDER.map((stage, i) => {
                        const done = doneStages.has(stage);
                        const failed = a.stageResults.find(s => s.stage === stage)?.error;
                        return (
                          <div key={stage} className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium"
                              style={failed
                                ? { color: "#DC2626", background: "#FEE2E2" }
                                : done
                                ? { color: "#16A34A", background: "#DCFCE7" }
                                : { color: "#9CA3AF", background: "#F3F4F6" }}>
                              {failed ? <XCircle className="h-3 w-3" /> : done ? <CheckCircle2 className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                              {STAGE_LABEL[stage]}
                            </span>
                            {i < STAGE_ORDER.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                          </div>
                        );
                      })}
                    </div>

                    {a.error && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{a.error}</div>
                    )}

                    {/* Proposed changes */}
                    {a.changes.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {a.changes.map(ch => (
                          <div key={ch.id}>
                            <div className="mb-1 flex items-center gap-2 text-xs">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">{ch.changeType}</span>
                              <span className="font-mono text-slate-600">{ch.filePath}</span>
                            </div>
                            {ch.reason && <p className="mb-1.5 text-xs leading-relaxed text-slate-500">{ch.reason}</p>}
                            {ch.diffPatch && <DiffBlock diff={ch.diffPatch} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Fingerprint Comparison ── */}
        <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Verification &mdash; Before / After Fingerprints</h3>
          </div>

          {c.verificationRuns.length === 0 ? (
            <p className="text-sm text-slate-400">
              No verification runs yet. Verification re-runs the independent scanners and compares the before / after
              cryptographic fingerprints. The scanner evidence &mdash; never the AI &mdash; decides the verdict.
            </p>
          ) : (
            <div className="space-y-5">
              {c.verificationRuns.map(run => {
                const v = VERDICT[run.status] ?? { label: run.status, color: "#6B7280", bg: "#F3F4F6", good: false };
                const before = run.findings.filter(f => f.phase === "BEFORE");
                const after = run.findings.filter(f => f.phase === "AFTER");
                const afterFP = new Set(after.map(f => f.fingerprint));
                const beforeFP = new Set(before.map(f => f.fingerprint));
                // Build a unified fingerprint row set.
                const rows = new Map<string, { fp: string; algorithm: string | null; scanner: string; inBefore: boolean; inAfter: boolean }>();
                for (const f of before) rows.set(f.fingerprint, { fp: f.fingerprint, algorithm: f.algorithm, scanner: f.scanner, inBefore: true, inAfter: afterFP.has(f.fingerprint) });
                for (const f of after) {
                  const ex = rows.get(f.fingerprint);
                  if (ex) ex.inAfter = true;
                  else rows.set(f.fingerprint, { fp: f.fingerprint, algorithm: f.algorithm, scanner: f.scanner, inBefore: beforeFP.has(f.fingerprint), inAfter: true });
                }
                const rowList = Array.from(rows.values());
                const resolved = rowList.filter(r => r.inBefore && !r.inAfter).length;
                const residual = rowList.filter(r => r.inBefore && r.inAfter).length;
                const introduced = rowList.filter(r => !r.inBefore && r.inAfter).length;

                return (
                  <div key={run.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {v.good ? <ShieldCheck className="h-4 w-4" style={{ color: v.color }} /> : <ShieldAlert className="h-4 w-4" style={{ color: v.color }} />}
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{ color: v.color, background: v.bg }}>{v.label}</span>
                        <span className="font-mono text-[11px] text-slate-300">{run.ref}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{formatDateTime(run.finishedAt ?? run.createdAt)}</span>
                    </div>

                    {run.verdictReason && <p className="mt-2 text-xs leading-relaxed text-slate-500">{run.verdictReason}</p>}

                    {/* Rollup */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                        <CheckCircle2 className="h-3 w-3" />{resolved} resolved
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        <MinusCircle className="h-3 w-3" />{residual} residual
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                        <XCircle className="h-3 w-3" />{introduced} introduced
                      </span>
                      {run.buildStatus && (
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                          Build: {run.buildStatus}
                        </span>
                      )}
                      {run.testStatus && (
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                          Tests: {run.testStatus}
                        </span>
                      )}
                    </div>

                    {/* Fingerprint table */}
                    {rowList.length > 0 && (
                      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                              <th className="px-3 py-2 font-semibold">Fingerprint</th>
                              <th className="px-3 py-2 font-semibold">Scanner</th>
                              <th className="px-3 py-2 text-center font-semibold">Before</th>
                              <th className="px-3 py-2 text-center font-semibold">After</th>
                              <th className="px-3 py-2 font-semibold">Outcome</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rowList.map(r => {
                              const outcome = r.inBefore && !r.inAfter
                                ? { label: "Resolved", color: "#16A34A" }
                                : !r.inBefore && r.inAfter
                                ? { label: "Introduced", color: "#DC2626" }
                                : { label: "Residual", color: "#D97706" };
                              return (
                                <tr key={r.fp}>
                                  <td className="px-3 py-2">
                                    <span className="font-medium text-slate-600">{r.algorithm ?? "—"}</span>
                                    <span className="ml-1.5 font-mono text-[10px] text-slate-300">{r.fp.slice(0, 24)}</span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-400">{r.scanner}</td>
                                  <td className="px-3 py-2 text-center">
                                    {r.inBefore ? <XCircle className="mx-auto h-3.5 w-3.5 text-red-400" /> : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {r.inAfter ? <XCircle className="mx-auto h-3.5 w-3.5 text-red-400" /> : <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-green-500" />}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="font-semibold" style={{ color: outcome.color }}>{outcome.label}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Scanner coverage */}
                    {run.scannerResults.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {run.scannerResults.map(sr => (
                          <span key={sr.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            {sr.phase}·{sr.scanner}: {sr.status} ({sr.findingCount})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Verdict-source note */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-sm leading-relaxed text-slate-500">
              The verdict is determined solely by the deterministic verification engine comparing independent scanner
              evidence before and after the change &mdash; never by the AI&rsquo;s own assessment. A case is only marked
              <span className="font-semibold text-slate-600"> Verified</span> when the scanners confirm the vulnerable
              fingerprints are gone, behind a human review gate.
              {latestAttempt?.verdict && <> Latest attempt verdict: <span className="font-semibold text-slate-600">{latestAttempt.verdict}</span>.</>}
            </p>
          </div>
        </div>

      </div>
    </PageShell>
  );
}
