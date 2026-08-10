"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/utils";
import { CheckCircle, AlertOctagon, Clock, X, ClipboardList } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";

type UserStub = { id: string; name: string; email: string };

type Control = {
  id: string;
  ref: string;
  title: string;
  domain: string;
  implementationStatus: string;
  testFrequency: string | null;
  lastTestedAt: string | null;
  nextTestDue: string | null;
  _count: { tests: number };
  risks: { risk: { id: string; title: string; residualRating: string } }[];
};

const domainLabels: Record<string, string> = {
  CRYPTOGRAPHIC_INVENTORY: "CRYPTO",
  ALGORITHM_GOVERNANCE:    "ALGORITHM",
  KEY_MANAGEMENT:          "KEY MGMT",
  CERTIFICATE_MANAGEMENT:  "CERT",
  POST_QUANTUM_READINESS:  "PQC",
  THIRD_PARTY_RISK:        "3RD PARTY",
  GOVERNANCE:              "GOVERNANCE",
  OPERATIONAL:             "OPERATIONAL",
};

const domainColors: Record<string, string> = {
  CRYPTOGRAPHIC_INVENTORY: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  ALGORITHM_GOVERNANCE:    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  KEY_MANAGEMENT:          "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  CERTIFICATE_MANAGEMENT:  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  POST_QUANTUM_READINESS:  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  THIRD_PARTY_RISK:        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  GOVERNANCE:              "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  OPERATIONAL:             "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function implStatusBadge(s: string) {
  const map: Record<string, [string, string]> = {
    IMPLEMENTED:     ["bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800", "Implemented"],
    PARTIALLY_IMPLEMENTED: ["bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800", "Partial"],
    NOT_IMPLEMENTED: ["bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800", "Not Implemented"],
    NOT_APPLICABLE:  ["bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", "N/A"],
  };
  const [cls, label] = map[s] ?? ["bg-slate-100 text-slate-600 border-slate-200", s];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// â”€â”€ Schedule Test Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ScheduleModal({
  control,
  users,
  onClose,
  onScheduled,
}: {
  control: Control;
  users: UserStub[];
  onClose: () => void;
  onScheduled: (controlId: string) => void;
}) {
  const [testerId, setTesterId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [testMethod, setTestMethod] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit() {
    startTransition(async () => {
      const res = await fetch("/api/control-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlId: control.id,
          testerId: testerId || null,
          scheduledAt: scheduledAt || null,
          testMethod: testMethod || null,
        }),
      });
      if (res.ok) {
        onScheduled(control.id);
        onClose();
      } else {
        setError("Failed to schedule test.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-green-500" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Schedule Control Test</p>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{control.ref} — {control.title}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
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

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled Date</label>
            <input
              type="date"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

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

// â”€â”€ Main client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ControlsClient({ controls, users }: { controls: Control[]; users: UserStub[] }) {
  const [scheduleTarget, setScheduleTarget] = useState<Control | null>(null);
  // Track newly scheduled test counts optimistically
  const [extraCounts, setExtraCounts] = useState<Record<string, number>>({});

  const implemented = controls.filter((c) => c.implementationStatus === "IMPLEMENTED").length;
  const partial = controls.filter((c) => c.implementationStatus === "PARTIALLY_IMPLEMENTED").length;
  const notImpl = controls.filter((c) => c.implementationStatus === "NOT_IMPLEMENTED").length;
  const overdue = controls.filter((c) => c.nextTestDue && new Date(c.nextTestDue) < new Date()).length;

  function onScheduled(controlId: string) {
    setExtraCounts((prev) => ({ ...prev, [controlId]: (prev[controlId] ?? 0) + 1 }));
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Implemented" value={implemented} sub={`of ${controls.length} controls`} variant="low" icon={CheckCircle} />
        <StatCard label="Partial" value={partial} sub="partially implemented" variant="medium" icon={Clock} />
        <StatCard label="Not Implemented" value={notImpl} sub="gap" variant="critical" icon={AlertOctagon} />
        <StatCard label="Test Overdue" value={overdue} sub="controls" variant="high" icon={AlertOctagon} />
      </div>

      <div className="mb-3 rounded border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
        <strong>SQCF — VERIQAS Quantum Control Framework</strong> · VERIQAS's internal control normalization framework for quantum risk governance. Not a government standard.
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {/* Table header */}
        <div className="grid grid-cols-[90px_48px_1fr_140px_120px_80px_90px_100px_120px] items-center border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
          <span>Ref</span>
          <span>Dom.</span>
          <span>Control</span>
          <span>Implementation</span>
          <span>Owner</span>
          <span>Tests</span>
          <span>Last Tested</span>
          <span>Next Due</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {controls.map((c) => {
            const testOverdue = c.nextTestDue && new Date(c.nextTestDue) < new Date();
            const testCount = (c._count.tests ?? 0) + (extraCounts[c.id] ?? 0);
            return (
              <div
                key={c.id}
                className="grid grid-cols-[90px_80px_1fr_140px_120px_80px_90px_100px_120px] items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <code className="font-mono text-[11px] text-slate-600 dark:text-slate-300">{c.ref}</code>

                <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${domainColors[c.domain] ?? "bg-slate-100 text-slate-700"}`}>
                  {domainLabels[c.domain] ?? c.domain}
                </span>

                <span className="truncate pr-3 text-sm font-medium text-slate-800 dark:text-slate-200">{c.title}</span>

                <span>{implStatusBadge(c.implementationStatus)}</span>

                <span className="truncate pr-2 text-xs text-slate-500">—</span>

                <span className="text-xs text-slate-500">
                  {testCount > 0 ? (
                    <a href="/control-tests" className="font-medium text-green-600 hover:underline dark:text-indigo-400">
                      {testCount} test{testCount !== 1 ? "s" : ""}
                    </a>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </span>

                <span className="text-xs text-slate-400">
                  {c.lastTestedAt ? formatDate(new Date(c.lastTestedAt)) : "Never"}
                </span>

                <span className={`text-xs ${testOverdue ? "font-semibold text-red-600" : "text-slate-400"}`}>
                  {c.nextTestDue ? formatDate(new Date(c.nextTestDue)) : "—"}
                  {testOverdue && " ⚠"}
                </span>

                <div className="flex justify-end">
                  <button
                    onClick={() => setScheduleTarget(c)}
                    className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                  >
                    Schedule Test
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {scheduleTarget && (
        <ScheduleModal
          control={scheduleTarget}
          users={users}
          onClose={() => setScheduleTarget(null)}
          onScheduled={onScheduled}
        />
      )}
    </>
  );
}

