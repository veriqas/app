import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label: string };
  icon?: LucideIcon;
  variant?: "default" | "critical" | "high" | "medium" | "low";
  className?: string;
}

const variantAccent: Record<string, string> = {
  default: "border-l-slate-400",
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-amber-500",
  low: "border-l-green-500",
};

export function StatCard({ label, value, sub, trend, icon: Icon, variant = "default", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-slate-200 bg-white px-4 py-4 border-l-4 dark:border-slate-700 dark:bg-slate-900",
        variantAccent[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {value}
          </p>
          {sub && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>
          )}
          {trend !== undefined && (
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                trend.value > 0
                  ? "text-green-600 dark:text-green-400"
                  : trend.value < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-500"
              )}
            >
              {trend.value > 0 ? "+" : ""}
              {trend.value} {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <Icon className="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500" />
        )}
      </div>
    </div>
  );
}
