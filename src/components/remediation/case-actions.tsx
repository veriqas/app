"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ShieldCheck, Loader2 } from "lucide-react";

interface Props {
  caseId: string;
  canRemediate: boolean;
  attemptsUsed: number;
  caseStatus: string;
}

export function CaseActions({ caseId, canRemediate, attemptsUsed, caseStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "remediate" | "verify">(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (kind: "remediate" | "verify") => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/remediation/cases/${caseId}/${kind}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed to ${kind}`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => call("verify")}
          disabled={busy !== null || attemptsUsed === 0}
          title={attemptsUsed === 0 ? "Run a remediation attempt first" : "Re-run scanners and compare fingerprints"}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Verify
        </button>
        {canRemediate ? (
          <button
            onClick={() => call("remediate")}
            disabled={busy !== null}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#f8781e" }}
          >
            {busy === "remediate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {attemptsUsed > 0 ? "Retry AI Remediation" : "Run AI Remediation"}
          </button>
        ) : (
          <span className="flex items-center rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-400">
            {caseStatus === "VERIFIED" ? "Verified" : `${attemptsUsed}/3 attempts used`}
          </span>
        )}
      </div>
      {error && <p className="max-w-[260px] text-right text-[11px] leading-tight text-red-500">{error}</p>}
    </div>
  );
}
