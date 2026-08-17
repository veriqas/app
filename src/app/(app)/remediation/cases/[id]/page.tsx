import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { isV2Enabled } from "@/lib/remediation/feature-flag";
import { formatDateTime } from "@/lib/utils";
import { lookupAlgorithm } from "@/lib/remediation/agent/knowledge-base";
import { CaseActions } from "@/components/remediation/case-actions";
import { AssignButton } from "@/components/remediation/assign-button";
import { PolicyPanel, strategyLabel, type PolicyJson } from "@/components/remediation/policy-panel";
import { DecisionChain } from "@/components/remediation/decision-chain";
import {
  Bot, ShieldCheck, ShieldAlert, FileCode2, GitBranch, Layers, ScanLine,
  CheckCircle2, XCircle, CircleDot, AlertTriangle, Target, Microscope,
} from "lucide-react";

export const dynamic = "force-dynamic";

const VERDICT: Record<string, { label: string; color: string; bg: string; border: string; good: boolean }> = {
  VERIFIED:               { label: "Verified",               color: "#15803D", bg: "#DCFCE7", border: "#86EFAC", good: true },
  VERIFIED_WITH_WARNINGS: { label: "Verified with warnings", color: "#4D7C0F", bg: "#ECFCCB", border: "#BEF264", good: true },
  FAILED:                 { label: "Not verified",           color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5", good: false },
  REGRESSED:              { label: "Regressed",              color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5", good: false },
  BUILD_FAILED:           { label: "Build failed",           color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5", good: false },
  TEST_FAILED:            { label: "Tests failed",           color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5", good: false },
  SCAN_FAILED:            { label: "Scan failed",            color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5", good: false },
  TIMEOUT:                { label: "Timed out",              color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5", good: false },
  NO_BASELINE:            { label: "No baseline",            color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", good: false },
};

const QUANTUM: Record<string, { label: string; severity: string; color: string; bg: string }> = {
  QUANTUM_VULNERABLE:       { label: "Quantum vulnerable", severity: "Critical", color: "#B91C1C", bg: "#FEE2E2" },
  QUANTUM_REDUCED_SECURITY: { label: "Reduced security",   severity: "Medium",   color: "#B45309", bg: "#FEF3C7" },
  QUANTUM_RESILIENT:        { label: "Quantum resilient",  severity: "Low",      color: "#15803D", bg: "#DCFCE7" },
  POST_QUANTUM:             { label: "Post-quantum",       severity: "Low",      color: "#15803D", bg: "#DCFCE7" },
  HYBRID:                   { label: "Hybrid",             severity: "Medium",   color: "#4338CA", bg: "#E0E7FF" },
  UNKNOWN:                  { label: "Unclassified",       severity: "Unknown",  color: "#64748B", bg: "#F1F5F9" },
};

/** The staged pipeline a reviewer expects to see completed, in order. */
const PIPELINE: { key: string; label: string }[] = [
  { key: "INVESTIGATOR", label: "Investigation" },
  { key: "ROOT_CAUSE",   label: "Root cause" },
  { key: "POLICY",       label: "Policy decision" },
  { key: "PLANNER",      label: "Strategy" },
  { key: "PATCHER",      label: "Patch generated" },
  { key: "APPLIED",      label: "Patch applied" },
];

function DiffBlock({ diff }: { diff: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
      {diff.split("\n").map((line, i) => {
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

function Stat({ value, label, icon: Icon }: { value: React.ReactNode; label: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-slate-300" />
      <div>
        <p className="text-lg font-bold leading-none text-slate-800">{value}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
      </div>
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
      findings: { include: { observation: { select: { ref: true, algorithm: true, primitiveType: true, quantumClass: true, filePath: true, lineNumber: true, sensorType: true, confidence: true } } } },
      attempts: { orderBy: { attemptNumber: "asc" }, include: { stageResults: { orderBy: { createdAt: "asc" } }, changes: true } },
      verificationRuns: { orderBy: { createdAt: "desc" }, include: { findings: true, scannerResults: true } },
    },
  });
  if (!c) notFound();

  const obs = c.findings.map(f => f.observation).filter(Boolean);
  const quantumClass = String(obs.find(o => o?.quantumClass)?.quantumClass ?? "UNKNOWN");
  const primitiveType = String(obs.find(o => o?.primitiveType)?.primitiveType ?? "");
  const q = QUANTUM[quantumClass] ?? QUANTUM.UNKNOWN;
  const scanners = Array.from(new Set(c.findings.map(f => f.sensorType)));

  const latest = c.attempts[c.attempts.length - 1];
  const inv = latest?.investigationJson as { purpose?: string; dataProtected?: string; confidence?: number; scope?: string; dependents?: string[]; isGenuine?: boolean } | null;
  const rca = latest?.rootCauseJson as { rootCause?: string; why?: string; migrationConstraints?: string[] } | null;
  const plan = latest?.planJson as { strategy?: string; why?: string; expectedSecurityImprovement?: string; expectedCompatibilityImpact?: string } | null;
  const policy = latest?.policyJson as PolicyJson | null;
  const latestRun = c.verificationRuns[0];

  // Standards-based target from the knowledge base.
  //
  // Selected on the POLICY's purpose category rather than the catalogued
  // primitive type: RSA is catalogued as PUBLIC_KEY_ENCRYPTION even when it is
  // used to sign, so keying on the primitive alone would recommend a KEM for a
  // signing case. Where the evidence does not clearly indicate one, none is
  // shown rather than guessing at a NIST standard.
  const kb = lookupAlgorithm(c.algorithm);
  const purposeCategory = policy?.classification?.purposeCategory ?? "";
  const wantsSignature = ["AUTHENTICATION", "SIGNATURE"].includes(purposeCategory) || primitiveType === "DIGITAL_SIGNATURE";
  const wantsKem = ["KEY_ESTABLISHMENT", "CONFIDENTIALITY"].includes(purposeCategory)
    || (!wantsSignature && (primitiveType === "KEY_ESTABLISHMENT" || primitiveType === "PUBLIC_KEY_ENCRYPTION"));
  const preferredTarget = wantsSignature
    ? kb?.pqcAlternatives?.find(a => /signature|DSA/i.test(a)) ?? null
    : wantsKem
    ? kb?.pqcAlternatives?.find(a => /KEM|key establishment/i.test(a)) ?? null
    : kb?.pqcAlternatives?.length === 1 ? kb.pqcAlternatives[0] : null;

  const confidencePct = typeof inv?.confidence === "number" ? Math.round(inv.confidence * 100) : null;
  const manualReview = latest?.strategy === "MANUAL_REVIEW" || latest?.status === "REVIEW" && !latest?.verdict;
  const outOfPolicy = c.attempts.some(a => a.status === "OUT_OF_POLICY");

  return (
    <PageShell
      title="Remediation Case"
      breadcrumbs={[{ label: "Governance" }, { label: "Remediation Center", href: "/remediation" }, { label: c.ref }]}
    >
      <div className="max-w-5xl space-y-5">

        {/* ── Case header ── */}
        <section className="rounded-2xl bg-white p-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: q.color, background: q.bg }}>
                  {q.severity} · {q.label}
                </span>
                <code className="font-mono text-xs text-slate-400">{c.ref}</code>
              </div>
              <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
                {c.algorithm ?? "Unclassified"}
                {inv?.purpose && <span className="font-normal text-slate-400"> · {inv.purpose}</span>}
              </h2>
              {c.repoUrl && <p className="mt-1 text-xs text-slate-400">{c.repoUrl}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <CaseActions caseId={c.id} canRemediate={c.attempts.length < 3 && !["VERIFIED", "DISMISSED"].includes(c.status)} attemptsUsed={c.attempts.length} caseStatus={c.status} />
              <AssignButton caseId={c.id} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 md:grid-cols-4">
            <Stat value={c.findingCount} label={`correlated finding${c.findingCount === 1 ? "" : "s"}`} icon={GitBranch} />
            <Stat value={scanners.length} label={`scanner${scanners.length === 1 ? "" : "s"}`} icon={ScanLine} />
            <Stat value={c.affectedFiles.length} label={`affected file${c.affectedFiles.length === 1 ? "" : "s"}`} icon={FileCode2} />
            <Stat value={`${c.confidence}%`} label="correlation confidence" icon={Layers} />
          </div>
        </section>

        {/* ── The four layers, for this case ── */}
        <DecisionChain
          strategyLabel={strategyLabel}
          state={{
            aiStrategy: latest?.strategy ?? null,
            policyPermitted: !latest?.policyJson ? null : latest.status !== "OUT_OF_POLICY",
            policyVersion: latest?.strategyPolicyVersion ?? null,
            verdict: latestRun?.status ?? latest?.verdict ?? null,
            humanDecision: c.status === "VERIFIED" ? "APPROVED" : "PENDING",
          }}
        />

        {/* ── Manual review ── */}
        {manualReview && (
          <section className="rounded-2xl border-2 px-6 py-5" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-800">Manual review required</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-amber-900">
                  VERIQAS determined that automatic migration would introduce unacceptable uncertainty.
                </p>
                {plan?.why && (
                  <div className="mt-3 rounded-lg bg-white/60 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Why</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{plan.why}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── AI analysis ── */}
        {(inv || rca || plan) && (
          <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <div className="mb-4 flex items-center gap-2">
              <Microscope className="h-4 w-4" style={{ color: "#f8781e" }} />
              <h3 className="text-sm font-semibold text-slate-700">AI Analysis</h3>
            </div>

            <dl className="space-y-4">
              {inv?.purpose && (
                <Field label="Purpose">
                  {inv.purpose}
                  {inv.dataProtected && <span className="text-slate-400"> — protects {inv.dataProtected}</span>}
                </Field>
              )}
              {rca?.rootCause && <Field label="Root cause">{rca.rootCause}</Field>}
              {plan?.strategy && (
                <Field label="Recommended strategy">
                  <span className="font-semibold" style={{ color: "#f8781e" }}>{strategyLabel(plan.strategy)}</span>
                  {plan.expectedSecurityImprovement && (
                    <span className="mt-0.5 block text-[13px] font-normal text-slate-500">{plan.expectedSecurityImprovement}</span>
                  )}
                </Field>
              )}
              {preferredTarget && <Field label="Standards-based target"><Target className="mr-1 inline h-3.5 w-3.5 text-slate-400" />{preferredTarget}</Field>}

              {confidencePct !== null && (
                <div>
                  <dt className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Investigation confidence</dt>
                  <dd className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${confidencePct}%`, background: confidencePct >= 60 ? "#f8781e" : "#CBD5E1" }} />
                    </div>
                    <span className="w-10 text-right text-[13px] font-bold text-slate-700">{confidencePct}%</span>
                  </dd>
                </div>
              )}

              {(rca?.migrationConstraints ?? []).length > 0 && (
                <Field label="Migration constraints">
                  <ul className="mt-0.5 space-y-0.5">
                    {rca!.migrationConstraints!.map((m, i) => (
                      <li key={i} className="text-[13px] text-slate-600">· {m}</li>
                    ))}
                  </ul>
                </Field>
              )}
            </dl>
          </section>
        )}

        {/* ── Policy decision ── */}
        {policy && <PolicyPanel policy={policy} />}

        {/* ── Verification ── */}
        {latestRun && <VerificationPanel run={latestRun} />}

        {/* ── Remediation attempts ── */}
        <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4" style={{ color: "#f8781e" }} />
            <h3 className="text-sm font-semibold text-slate-700">AI Remediation</h3>
            {outOfPolicy && (
              <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-600">
                an attempt was blocked by policy
              </span>
            )}
          </div>

          {c.attempts.length === 0 ? (
            <p className="text-sm text-slate-400">No remediation attempts yet.</p>
          ) : (
            <div className="space-y-5">
              {c.attempts.map(a => {
                const done = new Set(a.stageResults.map(s => s.stage));
                if (a.changes.length > 0) done.add("APPLIED");
                const blocked = a.status === "OUT_OF_POLICY";
                return (
                  <div key={a.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-700">Attempt {a.attemptNumber}</span>
                      <div className="flex items-center gap-2">
                        {a.strategyPolicyVersion && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">policy v{a.strategyPolicyVersion}</span>
                        )}
                        <code className="font-mono text-[11px] text-slate-300">{a.ref}</code>
                      </div>
                    </div>

                    <ul className="space-y-1.5">
                      {PIPELINE.map(step => {
                        const complete = done.has(step.key);
                        const isPolicyStep = step.key === "POLICY";
                        const failedHere = blocked && (isPolicyStep || step.key === "APPLIED");
                        return (
                          <li key={step.key} className="flex items-center gap-2 text-[13px]">
                            {failedHere ? <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                              : complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                              : <CircleDot className="h-4 w-4 shrink-0 text-slate-200" />}
                            <span className={complete && !failedHere ? "text-slate-700" : failedHere ? "font-medium text-red-600" : "text-slate-300"}>
                              {isPolicyStep && complete && !blocked ? "Policy approved" : step.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    {a.error && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-700">
                        {a.error}
                      </div>
                    )}

                    {a.changes.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer list-none text-[12px] font-medium text-slate-500 hover:text-slate-700">
                          {a.changes.length} file{a.changes.length === 1 ? "" : "s"} changed — view patch
                        </summary>
                        <div className="mt-2 space-y-3">
                          {a.changes.map(ch => (
                            <div key={ch.id}>
                              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">{ch.changeType}</span>
                                <span className="font-mono text-slate-600">{ch.filePath}</span>
                              </div>
                              {ch.reason && <p className="mb-1.5 text-[12px] leading-relaxed text-slate-500">{ch.reason}</p>}
                              {ch.diffPatch && <DiffBlock diff={ch.diffPatch} />}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Evidence ── */}
        <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Correlated Evidence</h3>
            <span className="text-xs text-slate-400">({c.findings.length})</span>
          </div>
          <div className="divide-y divide-slate-100">
            {c.findings.map(f => (
              <div key={f.observationId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <code className="font-mono text-xs text-slate-400">{f.observation?.ref}</code>{" "}
                  <span className="font-medium text-slate-700">{f.observation?.algorithm}</span>
                  <span className="ml-2 font-mono text-xs text-slate-400">
                    {f.observation?.filePath}{f.observation?.lineNumber ? `:${f.observation.lineNumber}` : ""}
                  </span>
                </div>
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{f.sensorType}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="px-1 pb-2 text-center text-[12px] leading-relaxed text-slate-400">
          The verdict is set by independent scanners comparing the code before and after the change —
          never by the AI. Nothing is applied to your repository without human approval.
        </p>
      </div>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-[14px] leading-relaxed text-slate-700">{children}</dd>
    </div>
  );
}

function VerificationPanel({ run }: {
  run: {
    ref: string; status: string; verdictReason: string | null; buildStatus: string | null; testStatus: string | null;
    finishedAt: Date | null; createdAt: Date;
    findings: { phase: string; algorithm: string | null }[];
    scannerResults: { scanner: string; status: string; findingCount: number }[];
  };
}) {
  const v = VERDICT[run.status] ?? { label: run.status.replace(/_/g, " "), color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", good: false };

  // Counts per algorithm, before and after, so a reviewer sees what moved.
  const tally = new Map<string, { before: number; after: number }>();
  for (const f of run.findings) {
    const k = f.algorithm ?? "unknown";
    const e = tally.get(k) ?? { before: 0, after: 0 };
    if (f.phase === "BEFORE") e.before++; else e.after++;
    tally.set(k, e);
  }
  const rows = [...tally.entries()].sort((a, b) => (b[1].before - a[1].before) || a[0].localeCompare(b[0]));

  return (
    <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Verification</h3>
        </div>
        <span className="text-[11px] text-slate-400">
          {formatDateTime(run.finishedAt ?? run.createdAt)} · <code className="font-mono">{run.ref}</code>
        </span>
      </div>

      {rows.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2 font-semibold">Algorithm</th>
                <th className="px-4 py-2 text-center font-semibold">Before</th>
                <th className="px-4 py-2 text-center font-semibold">After</th>
                <th className="px-4 py-2 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([algo, n]) => {
                // A post-quantum primitive appearing only after the change is the
                // intended replacement, not a new problem. Anything else that is
                // only present afterwards is reported neutrally: this view cannot
                // tell "introduced by the patch" from "already elsewhere in the
                // repository", and must not assert the stronger claim.
                const isReplacement = lookupAlgorithm(algo)?.classification === "RESILIENT";
                const outcome = n.before > 0 && n.after === 0 ? { label: "Resolved", color: "#15803D" }
                  : n.before === 0 && n.after > 0
                  ? isReplacement ? { label: "Replacement", color: "#15803D" } : { label: "Present after", color: "#B45309" }
                  : { label: "Still present", color: "#B91C1C" };
                return (
                  <tr key={algo}>
                    <td className="px-4 py-2 font-medium text-slate-700">{algo}</td>
                    <td className="px-4 py-2 text-center tabular-nums text-slate-600">{n.before}</td>
                    <td className="px-4 py-2 text-center tabular-nums text-slate-600">{n.after}</td>
                    <td className="px-4 py-2 font-semibold" style={{ color: outcome.color }}>{outcome.label}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50/60 text-slate-500">
                <td className="px-4 py-2 text-[12px]">Build</td>
                <td className="px-4 py-2 text-center text-[12px]" colSpan={2}>{run.buildStatus ?? "NOT_RUN"}</td>
                <td className="px-4 py-2 text-[12px]">Tests: {run.testStatus ?? "NOT_RUN"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Verdict */}
      <div className="rounded-xl border-2 px-5 py-4" style={{ borderColor: v.border, background: v.bg }}>
        <div className="flex items-center gap-2.5">
          {v.good ? <ShieldCheck className="h-6 w-6" style={{ color: v.color }} /> : <ShieldAlert className="h-6 w-6" style={{ color: v.color }} />}
          <span className="text-lg font-bold uppercase tracking-wide" style={{ color: v.color }}>{v.label}</span>
        </div>
        {run.verdictReason && <p className="mt-2 text-[13px] leading-relaxed" style={{ color: v.color, opacity: 0.9 }}>{run.verdictReason}</p>}
        {run.scannerResults.length > 0 && (
          <p className="mt-2 text-[11px]" style={{ color: v.color, opacity: 0.7 }}>
            Confirmed by {run.scannerResults.map(s => `${s.scanner} (${s.status})`).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}
