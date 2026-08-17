"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, Check, X } from "lucide-react";

interface UserOption { id: string; name: string | null; email: string }
interface Assignment {
  id: string; ref: string; title: string; status: string; priority: string;
  dueDate: string | null; assignee: UserOption | null;
}

/**
 * Assign a review of this case to a colleague. Creates a task in the platform's
 * existing Action record, so it lands in that person's My Work rather than in a
 * separate remediation-only queue.
 */
export function AssignButton({ caseId, compact = false }: { caseId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/remediation/cases/${caseId}/assign`);
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users ?? []);
        setAssignments(d.assignments ?? []);
        if (!assigneeId && d.users?.[0]) setAssigneeId(d.users[0].id);
      }
    } finally { setLoaded(true); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [caseId]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/remediation/cases/${caseId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId, dueDate: dueDate || undefined, note: note || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Could not assign this case."); return; }
      setOpen(false); setNote("");
      await load();
      router.refresh();
    } catch { setError("Network error"); } finally { setBusy(false); }
  };

  const current = assignments[0];

  // Already assigned: show who owns it rather than offering a duplicate task.
  if (current && !open) {
    return (
      <div className={compact ? "" : "flex flex-col items-end gap-1"}>
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-1.5">
          <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
          <span className="text-[12px] text-green-800">
            Assigned to <span className="font-semibold">{current.assignee?.name ?? current.assignee?.email ?? "—"}</span>
            {current.dueDate && <span className="text-green-600"> · due {new Date(current.dueDate).toLocaleDateString()}</span>}
          </span>
        </div>
        {!compact && (
          <button onClick={() => setOpen(true)} className="text-[11px] text-slate-400 underline hover:text-slate-600">
            Assign to someone else
          </button>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!loaded}
        className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{ background: "rgba(248,120,30,0.10)", color: "#c45a0e", border: "1px solid rgba(248,120,30,0.25)" }}
      >
        <UserPlus className="h-4 w-4" />
        Assign review
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Assign review</p>
        <button onClick={() => { setOpen(false); setError(null); }} aria-label="Cancel" className="text-slate-300 hover:text-slate-500">
          <X className="h-4 w-4" />
        </button>
      </div>

      {users.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-slate-500">
          There are no other active users in this organisation yet. Add colleagues under Administration → Users
          to assign work to them.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="assignee" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Assignee</label>
            <select
              id="assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700"
            >
              {users.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="due" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Due date (optional)</label>
            <input id="due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700" />
          </div>
          <div>
            <label htmlFor="note" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Note (optional)</label>
            <textarea id="note" rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Anything the reviewer should know"
              className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700" />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Priority is set from the case severity. The task appears in the assignee&rsquo;s My Work.
          </p>
          <button
            onClick={submit} disabled={busy || !assigneeId}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#f8781e" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {busy ? "Assigning…" : "Assign"}
          </button>
          {error && <p className="text-[11px] leading-tight text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
