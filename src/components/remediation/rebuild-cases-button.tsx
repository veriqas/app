"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";

export function RebuildCasesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rebuild = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/remediation/cases", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to rebuild cases");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={rebuild}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ background: "#f8781e" }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {loading ? "Correlating…" : "Rebuild cases"}
      </button>
      {error && <p className="mt-1 max-w-[220px] text-right text-[11px] leading-tight text-red-500">{error}</p>}
    </div>
  );
}
