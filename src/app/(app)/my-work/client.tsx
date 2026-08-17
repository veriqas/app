"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, severityBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AlertOctagon, CheckCircle, CheckSquare, Clock, Shield, UserPlus, X, ChevronRight, Calendar, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type UserStub = { id: string; name: string; email: string };

type ActionRow = {
  id: string;
  ref: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  owner: UserStub | null;
  assignee: UserStub | null;
  /** Set when the task is a remediation-case review, for a direct link. */
  caseId?: string | null;
};

type RiskRow = {
  id: string;
  ref: string;
  title: string;
  residualRating: string;
  reviewDate: string | null;
};

interface Props {
  myActions: ActionRow[];
  myRisks: RiskRow[];
  allActions: ActionRow[];
  users: UserStub[];
  currentUserId: string;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  ASSIGNED: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  IN_PROGRESS: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  OVERDUE: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  PLANNED: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.PLANNED}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function UserAvatar({ name, email }: { name: string; email: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-[11px] font-semibold text-green-700 dark:bg-green-900 dark:text-green-300">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{name}</p>
        <p className="truncate text-xs text-slate-400">{email}</p>
      </div>
    </div>
  );
}

interface AssignModalProps {
  action: ActionRow | null;
  allActions: ActionRow[];
  users: UserStub[];
  onClose: () => void;
  onAssigned: (actionId: string, assignee: UserStub | null) => void;
}

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function AssignModal({ action: initialAction, allActions, users, onClose, onAssigned }: AssignModalProps) {
  const [step, setStep] = useState<"task" | "user">(initialAction ? "user" : "task");
  const [selectedAction, setSelectedAction] = useState<ActionRow | null>(initialAction);
  const [selectedUserId, setSelectedUserId] = useState<string>(initialAction?.assignee?.id ?? "");
  const [taskSearch, setTaskSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredTasks = allActions
    .filter((a) =>
      a.title.toLowerCase().includes(taskSearch.toLowerCase()) ||
      a.ref.toLowerCase().includes(taskSearch.toLowerCase())
    )
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  function handleAssign() {
    if (!selectedAction) return;
    startTransition(async () => {
      const res = await fetch(`/api/actions/${selectedAction.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: selectedUserId || null }),
      });
      if (res.ok) {
        const assignee = selectedUserId ? users.find((u) => u.id === selectedUserId) ?? null : null;
        onAssigned(selectedAction.id, assignee);
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assign Task</p>
            {/* Step indicators */}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setStep("task")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  step === "task"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : selectedAction
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {selectedAction ? <CheckCircle className="h-3 w-3" /> : <span className="h-3 w-3 text-center leading-3">1</span>}
                {selectedAction ? <span className="max-w-[160px] truncate">{selectedAction.ref}</span> : "Pick task"}
              </button>
              <span className="text-slate-300 dark:text-slate-600">→</span>
              <button
                onClick={() => { if (selectedAction) setStep("user"); }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  step === "user"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : selectedUserId
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                <span className="h-3 w-3 text-center leading-3">2</span>
                {selectedUserId ? users.find(u => u.id === selectedUserId)?.name.split(" ")[0] : "Pick person"}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1 — Task picker */}
        {step === "task" && (
          <>
            <div className="px-5 py-3">
              <input
                autoFocus
                type="text"
                placeholder="Search tasks by name or ref…"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-green-400 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
            <div className="max-h-72 overflow-y-auto px-3 pb-3">
              {filteredTasks.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setSelectedAction(a); setSelectedUserId(a.assignee?.id ?? ""); setStep("user"); }}
                  className={`mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    selectedAction?.id === a.id
                      ? "bg-green-50 ring-1 ring-green-300 dark:bg-green-950 dark:ring-green-700"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{severityBadge(a.priority)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{a.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">{a.ref}</span>
                      {a.caseId && (
                        <a
                          href={`/remediation/cases/${a.caseId}`}
                          onClick={e => e.stopPropagation()}
                          className="text-[11px] font-medium text-orange-600 underline decoration-orange-200 underline-offset-2 hover:decoration-orange-500"
                        >
                          Open case
                        </a>
                      )}
                      {a.assignee && (
                        <span className="text-xs text-slate-400">→ {a.assignee.name}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
              {filteredTasks.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">No tasks found</p>
              )}
            </div>
          </>
        )}

        {/* Step 2 — User picker */}
        {step === "user" && (
          <>
            {selectedAction && (
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{selectedAction.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">{selectedAction.ref}</p>
              </div>
            )}
            <div className="px-5 py-3">
              <input
                autoFocus
                type="text"
                placeholder="Search by name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-green-400 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
            <div className="max-h-56 overflow-y-auto px-3 pb-3">
              <button
                onClick={() => setSelectedUserId("")}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selectedUserId === ""
                    ? "bg-green-50 ring-1 ring-green-300 dark:bg-green-950 dark:ring-green-700"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600">
                  <span className="text-[10px] text-slate-400">—</span>
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400">Unassigned</span>
                {selectedUserId === "" && <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-green-500" />}
              </button>
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    selectedUserId === u.id
                      ? "bg-green-50 ring-1 ring-green-300 dark:bg-green-950 dark:ring-green-700"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <UserAvatar name={u.name} email={u.email} />
                  {selectedUserId === u.id && <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-green-500" />}
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">No users found</p>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          {step === "task" ? (
            <Button size="sm" disabled={!selectedAction} onClick={() => setStep("user")}>
              Next: Pick Person
            </Button>
          ) : (
            <Button size="sm" onClick={handleAssign} disabled={isPending || !selectedAction}>
              {isPending ? "Saving…" : "Confirm Assignment"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const RISK_STATUSES = ["OPEN", "UNDER_ASSESSMENT", "TREATMENT_PLANNED", "IN_REMEDIATION", "MONITORING", "ACCEPTED", "CLOSED"] as const;
const RISK_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open", UNDER_ASSESSMENT: "Under Assessment", TREATMENT_PLANNED: "Treatment Planned",
  IN_REMEDIATION: "In Remediation", MONITORING: "Monitoring", ACCEPTED: "Accepted", CLOSED: "Closed",
};
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const NEXT_REVIEW_OPTIONS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
  { label: "1 year", days: 365 },
];

interface CompleteReviewModalProps {
  risk: RiskRow;
  onClose: () => void;
  onReviewed: (id: string, patch: Partial<RiskRow>) => void;
}

function CompleteReviewModal({ risk, onClose, onReviewed }: CompleteReviewModalProps) {
  const [residualRating, setResidualRating] = useState(risk.residualRating);
  const [status, setStatus] = useState(risk.status ?? "OPEN");
  const [nextDays, setNextDays] = useState(residualRating === "CRITICAL" || residualRating === "HIGH" ? 90 : 180);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const res = await fetch(`/api/risks/${risk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          residualRating,
          lastReviewedAt: new Date().toISOString(),
          nextReviewDays: nextDays,
        }),
      });
      if (res.ok) {
        const next = new Date();
        next.setDate(next.getDate() + nextDays);
        onReviewed(risk.id, {
          status,
          residualRating,
          reviewDate: next.toISOString(),
        });
        onClose();
      }
    });
  }

  const ratingColors: Record<string, string> = {
    CRITICAL: "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    HIGH: "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    MEDIUM: "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    LOW: "border-green-400 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-purple-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Complete Review</p>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{risk.title}</p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-400">{risk.ref}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Residual rating */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Residual Rating</p>
            <div className="flex gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setResidualRating(s);
                    setNextDays(s === "CRITICAL" || s === "HIGH" ? 90 : 180);
                  }}
                  className={`flex-1 rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-all ${
                    residualRating === s
                      ? ratingColors[s]
                      : "border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Treatment Status</p>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {RISK_STATUSES.map((s) => (
                <option key={s} value={s}>{RISK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Next review */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule Next Review</p>
            <div className="flex gap-2">
              {NEXT_REVIEW_OPTIONS.map((o) => (
                <button
                  key={o.days}
                  onClick={() => setNextDays(o.days)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    nextDays === o.days
                      ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Next review: {(() => { const d = new Date(); d.setDate(d.getDate() + nextDays); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })()}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={isPending}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            {isPending ? "Saving…" : "Complete Review"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const OPEN_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "OVERDUE", "COMPLETED", "CLOSED"] as const;

async function patchAction(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/actions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
}

function ActionItem({
  action: a,
  users,
  onGlobalAssign,
  onUpdated,
}: {
  action: ActionRow;
  users: UserStub[];
  onGlobalAssign: (a: ActionRow) => void;
  onUpdated: (id: string, patch: Partial<ActionRow>) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleStatus(status: string) {
    setSaving(true);
    const result = await patchAction(a.id, { status });
    if (result) onUpdated(a.id, { status, dueDate: result.action.completedAt ? null : a.dueDate });
    setSaving(false);
  }

  async function handleDueDate(val: string) {
    const result = await patchAction(a.id, { dueDate: val || null });
    if (result) onUpdated(a.id, { dueDate: val || null });
  }

  const isCompleted = a.status === "COMPLETED" || a.status === "CLOSED";

  return (
    <div className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isCompleted ? "opacity-50" : ""}`}>
      <div className="w-20 shrink-0">{severityBadge(a.priority)}</div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium text-slate-800 dark:text-slate-200 ${isCompleted ? "line-through" : ""}`}>{a.title}</p>
        <div className="mt-1 flex items-center gap-2">
          {/* Status dropdown */}
          <select
            value={a.status}
            disabled={saving}
            onChange={(e) => handleStatus(e.target.value)}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {OPEN_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          {/* Due date */}
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-slate-400" />
            <input
              type="date"
              value={a.dueDate ? a.dueDate.slice(0, 10) : ""}
              onChange={(e) => handleDueDate(e.target.value)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            />
          </div>
        </div>
      </div>

      {/* Assignee */}
      <div className="w-36 shrink-0">
        {a.assignee ? (
          <div className="flex items-center gap-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] font-semibold text-green-700 dark:bg-green-900 dark:text-green-300">
              {a.assignee.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <span className="truncate text-xs text-slate-600 dark:text-slate-300">{a.assignee.name}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Unassigned</span>
        )}
      </div>

      {/* Quick complete */}
      <button
        onClick={() => handleStatus(isCompleted ? "OPEN" : "COMPLETED")}
        disabled={saving}
        title={isCompleted ? "Reopen" : "Mark complete"}
        className={`shrink-0 rounded p-1.5 transition-colors ${
          isCompleted
            ? "text-green-500 hover:bg-green-50 dark:hover:bg-green-950"
            : "text-slate-300 hover:bg-slate-100 hover:text-green-500 dark:hover:bg-slate-800"
        }`}
      >
        <CheckSquare className="h-4 w-4" />
      </button>

      <button
        onClick={() => onGlobalAssign(a)}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-green-700 dark:hover:bg-green-950 dark:hover:text-green-300"
      >
        <UserPlus className="h-3 w-3" />
        Assign
      </button>
      <span className="w-24 shrink-0 text-right font-mono text-[10px] text-slate-400">{a.ref}</span>
    </div>
  );
}

interface AssignAllPanelProps {
  actions: ActionRow[];
  users: UserStub[];
  currentUserId: string;
  onGlobalAssign: (action: ActionRow) => void;
  onUpdated: (id: string, patch: Partial<ActionRow>) => void;
}

function AssignAllPanel({ actions, users, currentUserId, onGlobalAssign, onUpdated }: AssignAllPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const statuses = ["ALL", "OPEN", "ASSIGNED", "IN_PROGRESS", "OVERDUE"];

  const filtered = actions.filter((a) => {
    const matchSearch =
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.ref.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <Card className="col-span-12">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-green-500" />
            <CardTitle>All Open Actions — Assign &amp; Manage ({actions.length})</CardTitle>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <div className="flex gap-1">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {s === "ALL" ? "All" : STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((a) => (
            <ActionItem key={a.id} action={a} users={users} onGlobalAssign={onGlobalAssign} onUpdated={onUpdated} />
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-400">No actions match this filter</div>
          )}
        </div>
      </CardContent>

    </Card>
  );
}

export function MyWorkClient({ myActions, myRisks, allActions, users, currentUserId }: Props) {
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ActionRow | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [myActionList, setMyActionList] = useState(myActions);
  const [allActionList, setAllActionList] = useState(allActions);
  const [reviewTarget, setReviewTarget] = useState<RiskRow | null>(null);
  const [riskList, setRiskList] = useState(myRisks);

  function handleAssigned(actionId: string, assignee: UserStub | null) {
    const update = (list: ActionRow[]) =>
      list.map((a) =>
        a.id === actionId
          ? { ...a, assignee, status: assignee && a.status === "OPEN" ? "ASSIGNED" : a.status }
          : a
      );
    setMyActionList(update);
    setAllActionList(update);
  }

  return (
    <div className="grid grid-cols-12 gap-4">

      {/* Top action bar */}
      <div className="col-span-12 flex justify-end">
        <Button size="md" onClick={() => { setAssignTarget(null); setModalKey(k => k + 1); setAssignModalOpen(true); }}>
          <UserPlus className="h-4 w-4" />
          Assign Task
        </Button>
      </div>

      {/* Assigned to me */}
      <Card className="col-span-12 md:col-span-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-orange-500" />
            <CardTitle>Assigned to Me ({myActionList.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {myActionList.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No actions assigned to you</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {myActionList.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="mt-0.5">{severityBadge(a.priority)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill status={a.status} />
                      {a.dueDate && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />{formatDate(new Date(a.dueDate))}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">{a.ref}</span>
                  {a.caseId && (
                    <a
                      href={`/remediation/cases/${a.caseId}`}
                      className="shrink-0 text-[11px] font-medium text-orange-600 underline decoration-orange-200 underline-offset-2 hover:decoration-orange-500"
                    >
                      Open case
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risks to review */}
      <Card className="col-span-12 md:col-span-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-500" />
            <CardTitle>Risks Due for Review ({riskList.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {riskList.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No risks due for review in the next 90 days</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {riskList.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="w-20 shrink-0">{severityBadge(r.residualRating)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{r.title}</p>
                    {r.reviewDate && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        Review due: {formatDate(new Date(r.reviewDate))}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setReviewTarget(r)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-900"
                  >
                    <ClipboardCheck className="h-3 w-3" />
                    Review
                  </button>
                  <span className="w-20 shrink-0 text-right font-mono text-[10px] text-slate-400">{r.ref}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {reviewTarget && (
        <CompleteReviewModal
          risk={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onReviewed={(id, patch) => {
            setRiskList((prev) => prev.filter((r) => r.id !== id).concat(
              prev.filter((r) => r.id === id).map((r) => ({ ...r, ...patch }))
            ));
            setReviewTarget(null);
          }}
        />
      )}

      {/* All actions — assign panel */}
      <AssignAllPanel
        actions={allActionList}
        users={users}
        currentUserId={currentUserId}
        onGlobalAssign={(a) => { setAssignTarget(a); setModalKey(k => k + 1); setAssignModalOpen(true); }}
        onUpdated={(id, patch) => {
          const update = (list: ActionRow[]) => list.map(a => a.id === id ? { ...a, ...patch } : a);
          setAllActionList(update);
          setMyActionList(update);
        }}
      />

      {/* Global assign modal — task+person picker */}
      {assignModalOpen && (
        <AssignModal
          key={modalKey}
          action={assignTarget}
          allActions={allActionList}
          users={users}
          onClose={() => { setAssignModalOpen(false); setAssignTarget(null); }}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
