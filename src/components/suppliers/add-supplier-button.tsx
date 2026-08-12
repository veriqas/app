"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";

const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const DATA_ACCESS_OPTIONS = ["CRYPTOGRAPHIC", "CREDENTIALS", "PERSONAL_DATA", "FINANCIAL", "OPERATIONAL", "NONE"];

export function AddSupplierButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [serviceProvided, setServiceProvided] = useState("");
  const [criticality, setCriticality] = useState<string>("MEDIUM");
  const [dataAccess, setDataAccess] = useState<string[]>([]);

  const reset = () => {
    setName(""); setServiceProvided(""); setCriticality("MEDIUM"); setDataAccess([]); setError(null);
  };

  const toggleAccess = (v: string) =>
    setDataAccess(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Supplier name is required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, serviceProvided, criticality, dataAccess }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create supplier");
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
        <Plus className="h-3.5 w-3.5" /> Add Supplier
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Add Supplier</h2>
              <button onClick={() => setOpen(false)} disabled={saving} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Supplier name *</label>
                <input
                  value={name} onChange={e => setName(e.target.value)} autoFocus
                  placeholder="e.g. CloudCrypto Ltd"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/30 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Service provided</label>
                <input
                  value={serviceProvided} onChange={e => setServiceProvided(e.target.value)}
                  placeholder="e.g. HSM key management"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/30 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Criticality</label>
                <div className="flex gap-1.5">
                  {CRITICALITIES.map(c => (
                    <button key={c} type="button" onClick={() => setCriticality(c)}
                      className={`flex-1 rounded border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                        criticality === c
                          ? "border-[#f8781e] bg-[#f8781e]/10 text-[#c45a0e]"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Data access</label>
                <div className="flex flex-wrap gap-1.5">
                  {DATA_ACCESS_OPTIONS.map(d => (
                    <button key={d} type="button" onClick={() => toggleAccess(d)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        dataAccess.includes(d)
                          ? "border-[#f8781e] bg-[#f8781e]/10 text-[#c45a0e]"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
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
                  {saving ? "Creating…" : "Create Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
