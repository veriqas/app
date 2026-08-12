"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";

export function AddDepartmentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [headName, setHeadName] = useState("");

  const reset = () => { setName(""); setDescription(""); setHeadName(""); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Department name is required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, headName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create department");
        return;
      }
      setOpen(false); reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#f8781e] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#d4611a]"
      >
        <Plus className="h-3.5 w-3.5" /> Add Department
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Add Department</h2>
              <button onClick={() => setOpen(false)} disabled={saving} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Department name *</label>
                <input
                  value={name} onChange={e => setName(e.target.value)} autoFocus
                  placeholder="e.g. Treasury"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/30 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
                <input
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Treasury and payments operations"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/30 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Department head</label>
                <input
                  value={headName} onChange={e => setHeadName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/30 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={saving}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#f8781e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d4611a] disabled:opacity-60">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saving ? "Creating…" : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
