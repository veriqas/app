"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, FileCode, CheckCircle, XCircle, Cpu } from "lucide-react";

interface Props {
  observationId: string;
  quantumClass: string;
  existingJobId?: string;
  existingJobStatus?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  PENDING:  { label: "Queued",         color: "#6B7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)", icon: Loader2 },
  RUNNING:  { label: "Agent Running",  color: "#D97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.25)",  icon: Cpu },
  REVIEW:   { label: "Review",         color: "#2563EB", bg: "rgba(37,99,235,0.08)",  border: "rgba(37,99,235,0.25)",  icon: FileCode },
  APPROVED: { label: "Approved",       color: "#16A34A", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.25)",  icon: CheckCircle },
  APPLIED:  { label: "Applied",        color: "#7C3AED", bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.25)", icon: CheckCircle },
};

export function RemediateButton({ observationId, quantumClass, existingJobId, existingJobStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!["QUANTUM_VULNERABLE", "QUANTUM_REDUCED_SECURITY"].includes(quantumClass)) return null;

  // If a job exists with a known status, show its state as a clickable link
  if (existingJobId && existingJobStatus && STATUS_CONFIG[existingJobStatus]) {
    const cfg = STATUS_CONFIG[existingJobStatus];
    const Icon = cfg.icon;
    const isAnimated = existingJobStatus === "RUNNING" || existingJobStatus === "PENDING";
    return (
      <button
        onClick={() => router.push(`/remediation/${existingJobId}`)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all"
        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
      >
        <Icon className={`h-3 w-3 ${isAnimated ? "animate-pulse" : ""}`} />
        {cfg.label}
      </button>
    );
  }

  // No job yet — show "Remediate" button
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
