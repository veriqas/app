import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRef(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

export function severityLabel(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function alignmentLabel(s: string): string {
  return s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

export function quantumClassLabel(s: string): string {
  const map: Record<string, string> = {
    QUANTUM_VULNERABLE: "Quantum Vulnerable",
    QUANTUM_REDUCED_SECURITY: "Reduced Security",
    QUANTUM_RESILIENT: "Quantum Resilient",
    POST_QUANTUM: "Post-Quantum",
    HYBRID: "Hybrid",
    UNKNOWN: "Unknown",
    NOT_APPLICABLE: "Not Applicable",
  };
  return map[s] ?? s;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function scoreRating(score: number): string {
  if (score >= 80) return "LOW_EXPOSURE";
  if (score >= 60) return "MEDIUM_EXPOSURE";
  if (score >= 40) return "HIGH_EXPOSURE";
  return "CRITICAL_EXPOSURE";
}

export function scoreRatingLabel(score: number): string {
  const r = scoreRating(score);
  const map: Record<string, string> = {
    LOW_EXPOSURE: "Low Exposure",
    MEDIUM_EXPOSURE: "Medium Exposure",
    HIGH_EXPOSURE: "High Exposure",
    CRITICAL_EXPOSURE: "Critical Exposure",
  };
  return map[r];
}
