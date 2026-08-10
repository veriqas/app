import { cn } from "@/lib/utils";

type Variant =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"
  | "aligned"
  | "partial"
  | "not-aligned"
  | "not-assessed"
  | "not-applicable"
  | "verified"
  | "pending"
  | "expired"
  | "rejected"
  | "missing"
  | "default"
  | "outline"
  | "pq"
  | "hybrid"
  | "vulnerable"
  | "unknown";

const variantClasses: Record<Variant, string> = {
  critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  high: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  low: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  aligned: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  partial: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  "not-aligned": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  "not-assessed": "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  "not-applicable": "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-700",
  verified: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  pending: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  expired: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  rejected: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  missing: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  default: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  outline: "bg-transparent text-slate-700 border-slate-300 dark:text-slate-300 dark:border-slate-600",
  pq: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  hybrid: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  vulnerable: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  unknown: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium leading-none",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function severityBadge(s: string) {
  const map: Record<string, Variant> = {
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
    INFORMATIONAL: "info",
  };
  return <Badge variant={map[s] ?? "default"}>{s.charAt(0) + s.slice(1).toLowerCase()}</Badge>;
}

export function alignmentBadge(s: string) {
  const map: Record<string, Variant> = {
    ALIGNED: "aligned",
    PARTIALLY_ALIGNED: "partial",
    NOT_ALIGNED: "not-aligned",
    NOT_ASSESSED: "not-assessed",
    NOT_APPLICABLE: "not-applicable",
  };
  const labels: Record<string, string> = {
    ALIGNED: "Aligned",
    PARTIALLY_ALIGNED: "Partially Aligned",
    NOT_ALIGNED: "Not Aligned",
    NOT_ASSESSED: "Not Assessed",
    NOT_APPLICABLE: "Not Applicable",
  };
  return <Badge variant={map[s] ?? "default"}>{labels[s] ?? s}</Badge>;
}

export function quantumBadge(s: string) {
  const map: Record<string, Variant> = {
    QUANTUM_VULNERABLE: "vulnerable",
    QUANTUM_REDUCED_SECURITY: "medium",
    QUANTUM_RESILIENT: "low",
    POST_QUANTUM: "pq",
    HYBRID: "hybrid",
    UNKNOWN: "unknown",
    NOT_APPLICABLE: "not-applicable",
  };
  const labels: Record<string, string> = {
    QUANTUM_VULNERABLE: "Quantum Vulnerable",
    QUANTUM_REDUCED_SECURITY: "Reduced Security",
    QUANTUM_RESILIENT: "Quantum Resilient",
    POST_QUANTUM: "Post-Quantum",
    HYBRID: "Hybrid",
    UNKNOWN: "Unknown",
    NOT_APPLICABLE: "N/A",
  };
  return <Badge variant={map[s] ?? "default"}>{labels[s] ?? s}</Badge>;
}
