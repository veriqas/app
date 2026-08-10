"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { severityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Clock, Plus, X, ClipboardList, User, Calendar } from "lucide-react";

type UserStub = { id: string; name: string; email: string };
type ControlStub = { id: string; ref: string; title: string; domain: string };
type RiskStub = { id: string; title: string; residualRating: string };

type TestRow = {
  id: string;
  ref: string;
  title: string;
  testMethod: string | null;
  testerId: string | null;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  result: string | null;
  findings: string | null;
  notes: string | null;
  control: ControlStub & { risks: { risk: RiskStub }[] };
};

const STATUS_COLORS: Record<string, string> = {
  PLANNED:   "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  IN_PROGRESS:"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  COMPLETED: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  CANCELLED: "bg-slate-100 text-slate-400 border-slate-200",
};
const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned", IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled",
};

const RESULT_ICON: Record<string, React.ReactNode> = {
  PASS:    <CheckCircle2 className="h-4 w-4 text-green-500" />,
  FAIL:    <XCircle className="h-4 w-4 text-red-500" />,
  PARTIAL: <AlertCircle className="h-4 w-4 text-amber-500" />,
};
const RESULT_COLORS: Record<string, string> = {
  PASS:    "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300",
  FAIL:    "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300",
  PARTIAL: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

// ── Schedule Modal ────────────────────────────────────────────────────────────

function ScheduleModal({
  controls,
  users,
  onClose,
  onCreated,
}: {
  controls: ControlStub[];
  users: UserStub[];
  onClose: () => void;
  onCreated: (test: TestRow) => void;
}) {
  const [controlId, setControlId] = useState("");
  const [testerId, setTesterId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [testMethod, setTestMethod] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!controlId) { setError("Select a control."); return; }
    startTransition(async () => {
      const res = await fetch("/api/control-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId, testerId: testerId || null, scheduledAt: scheduledAt || null, testMethod: testMethod || null }),
      });
      if (res.ok) {
        const { test } = await res.json();
        onCreated(test);
        onClose();
      } else {
        setError("Failed to schedule test.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-green-500" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Schedule Control Test</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Control picker */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Control *</label>
            <select
              value={controlId}
              onChange={(e) => setControlId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Select a control…</option>
              {controls.map((c) => (
                <option key={c.id} value={c.id}>{c.ref} — {c.title}</option>
              ))}
            </select>
          </div>

          {/* Tester */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tester</label>
            <select
              value={testerId}
              onChange={(e) => setTesterId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
              ))}
            </select>
          </div>

          {/* Scheduled date */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled Date</label>
            <input
              type="date"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Test method */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Test Method / Procedure</label>
            <textarea
              value={testMethod}
              onChange={(e) => setTestMethod(e.target.value)}
              rows={3}
              placeholder="Describe how the control will be tested…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Scheduling…" : "Schedule Test"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Record Result Modal ───────────────────────────────────────────────────────

function RecordResultModal({
  test,
  users,
  onClose,
  onRecorded,
}: {
  test: TestRow;
  users: UserStub[];
  onClose: () => void;
  onRecorded: (id: string, patch: Partial<TestRow>) => void;
}) {
  const [result, setResult] = useState<string>(test.result ?? "");
  const [findings, setFindings] = useState(test.findings ?? "");
  const [notes, setNotes] = useState(test.notes ?? "");
  const [testerId, setTesterId] = useState(test.testerId ?? "");
  const [isPending, startTransition] = useTransition();

  const linkedRisks = (test.control.risks ?? []).map((r) => r.risk);

  function handleSubmit() {
    if (!result) return;
    startTransition(async () => {
      const res = await fetch(`/api/control-tests/${test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, findings, notes, testerId: testerId || null }),
      });
      if (res.ok) {
        onRecorded(test.id, {
          result,
          findings,
          notes,
          testerId: testerId || null,
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
        });
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0 pr-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Record Result</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{test.control.title}</p>
            <p className="font-mono text-[10px] text-slate-400">{test.ref}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Result */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Result *</label>
            <div className="flex gap-2">
              {(["PASS", "PARTIAL", "FAIL"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setResult(r)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all ${
                    result === r ? RESULT_COLORS[r] : "border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-700"
                  }`}
                >
                  {RESULT_ICON[r]}
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Tester */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tested By</label>
            <select
              value={testerId}
              onChange={(e) => setTesterId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Select tester…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Findings */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Findings</label>
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              rows={3}
              placeholder="What was observed during testing…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context or recommendations…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Impact preview */}
          {linkedRisks.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-1.5 text-xs font-semibold text-slate-500">Linked Risks — effectiveness will update</p>
              <div className="space-y-1">
                {linkedRisks.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    {severityBadge(r.residualRating)}
                    <span className="truncate text-xs text-slate-600 dark:text-slate-400">{r.title}</span>
                    {result && (
                      <span className={`ml-auto shrink-0 text-xs font-medium ${result === "PASS" ? "text-green-600" : result === "FAIL" ? "text-red-600" : "text-amber-600"}`}>
                        {result === "PASS" ? "↓ residual" : result === "FAIL" ? "↑ residual + action" : "↓ partial"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {result === "FAIL" && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              A remediation action will be created automatically and assigned to you.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={isPending || !result}>
            {isPending ? "Saving…" : "Record Result"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────

interface Props {
  tests: TestRow[];
  controls: ControlStub[];
  users: UserStub[];
}

export function ControlTestsClient({ tests: initialTests, controls, users }: Props) {
  const [tests, setTests] = useState(initialTests);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [resultTarget, setResultTarget] = useState<TestRow | null>(null);
  const [filter, setFilter] = useState("ALL");

  function onCreated(test: TestRow) {
    setTests((prev) => [test, ...prev]);
  }

  function onRecorded(id: string, patch: Partial<TestRow>) {
    setTests((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
  }

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const total = tests.length;
  const passed = tests.filter((t) => t.result === "PASS").length;
  const failed = tests.filter((t) => t.result === "FAIL").length;
  const due = tests.filter((t) => t.status === "PLANNED" && t.scheduledAt && new Date(t.scheduledAt) <= new Date(Date.now() + 14 * 864e5)).length;

  const filtered = tests.filter((t) => {
    if (filter === "ALL") return true;
    if (filter === "PLANNED") return t.status === "PLANNED";
    if (filter === "PASS") return t.result === "PASS";
    if (filter === "FAIL") return t.result === "FAIL";
    if (filter === "PARTIAL") return t.result === "PARTIAL";
    return true;
  });

  return (
    <>
      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          { label: "Total Tests", value: total, color: "text-slate-700 dark:text-slate-200" },
          { label: "Due in 14 Days", value: due, color: "text-amber-600" },
          { label: "Passed", value: passed, color: "text-green-600" },
          { label: "Failed", value: failed, color: "text-red-600" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={`mt-0.5 text-2xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Control Tests</CardTitle>
            <div className="flex gap-1">
              {["ALL", "PLANNED", "PASS", "PARTIAL", "FAIL"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="ml-auto">
              <Button size="sm" onClick={() => setScheduleOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Schedule Test
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">No tests yet — schedule one to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((t) => {
                const tester = t.testerId ? userMap[t.testerId] : null;
                const isOverdue = t.status === "PLANNED" && t.scheduledAt && new Date(t.scheduledAt) < new Date();
                return (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {/* Result / status indicator */}
                    <div className="shrink-0">
                      {t.result ? RESULT_ICON[t.result] : <Clock className={`h-4 w-4 ${isOverdue ? "text-red-400" : "text-slate-300"}`} />}
                    </div>

                    {/* Control info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{t.control.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{t.ref}</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[10px] text-slate-500">{t.control.domain.replace(/_/g, " ")}</span>
                        {t.result && (
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${RESULT_COLORS[t.result]}`}>
                            {t.result}
                          </span>
                        )}
                        {!t.result && (
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] ?? STATUS_COLORS.PLANNED}`}>
                            {STATUS_LABELS[t.status] ?? t.status}
                          </span>
                        )}
                      </div>
                      {/* Linked risks */}
                      {(t.control.risks ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(t.control.risks ?? []).slice(0, 3).map((rc) => (
                            <span key={rc.risk.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {rc.risk.title.slice(0, 40)}{rc.risk.title.length > 40 ? "…" : ""}
                            </span>
                          ))}
                          {(t.control.risks ?? []).length > 3 && (
                            <span className="text-[10px] text-slate-400">+{(t.control.risks ?? []).length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tester */}
                    <div className="w-32 shrink-0">
                      {tester ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-[9px] font-bold text-green-700 dark:bg-green-900 dark:text-green-300">
                            {tester.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <span className="truncate text-xs text-slate-600 dark:text-slate-300">{tester.name.split(" ")[0]}</span>
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-xs italic text-slate-400">
                          <User className="h-3 w-3" />Unassigned
                        </span>
                      )}
                    </div>

                    {/* Scheduled date */}
                    <div className="w-24 shrink-0 text-right">
                      {t.completedAt ? (
                        <span className="text-xs text-slate-500">{formatDate(new Date(t.completedAt))}</span>
                      ) : t.scheduledAt ? (
                        <span className={`text-xs ${isOverdue ? "font-medium text-red-500" : "text-slate-500"}`}>
                          {formatDate(new Date(t.scheduledAt))}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>

                    {/* Action */}
                    {t.status !== "COMPLETED" && (
                      <button
                        onClick={() => setResultTarget(t)}
                        className="shrink-0 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                      >
                        Record Result
                      </button>
                    )}
                    {t.status === "COMPLETED" && t.findings && (
                      <button
                        onClick={() => setResultTarget(t)}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        View
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {scheduleOpen && (
        <ScheduleModal
          controls={controls}
          users={users}
          onClose={() => setScheduleOpen(false)}
          onCreated={onCreated}
        />
      )}
      {resultTarget && (
        <RecordResultModal
          test={resultTarget}
          users={users}
          onClose={() => setResultTarget(null)}
          onRecorded={onRecorded}
        />
      )}
    </>
  );
}
