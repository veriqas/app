"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";

interface Props {
  observationId: string;
  quantumClass: string;
}

export function RemediateButton({ observationId, quantumClass }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show for vulnerable observations
  if (!["QUANTUM_VULNERABLE", "QUANTUM_REDUCED_SECURITY"].includes(quantumClass)) return null;

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/remediation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observationId }),
      });
      const data = await res.json();
      if (res.status === 409 && data.jobId) {
        // Job already exists — go to it
        router.push(`/remediation/${data.jobId}`);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to create job");
        return;
      }
      router.push(`/remediation/${data.id}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        title="Remediate with AI Agent"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all disabled:opacity-50"
        style={{ background: "rgba(248,120,30,0.10)", color: "#c45a0e", border: "1px solid rgba(248,120,30,0.25)" }}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
        {loading ? "Creating…" : "Remediate"}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-500 max-w-[120px] leading-tight">{error}</p>}
    </div>
  );
}
