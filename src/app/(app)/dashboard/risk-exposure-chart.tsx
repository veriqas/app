"use client";

interface Props {
  counts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
}

export function RiskExposureChart({ counts }: Props) {
  const data = [
    { label: "Critical", count: counts.CRITICAL, color: "#ef4444" },
    { label: "High", count: counts.HIGH, color: "#f97316" },
    { label: "Medium", count: counts.MEDIUM, color: "#f59e0b" },
    { label: "Low", count: counts.LOW, color: "#22c55e" },
  ];
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  // Simple horizontal stacked bar
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-sm">
        {data.map((d) => (
          <div
            key={d.label}
            style={{ width: `${(d.count / total) * 100}%`, backgroundColor: d.color }}
            className="transition-all"
            title={`${d.label}: ${d.count}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-center text-xs text-slate-500">
        {total} open quantum risks
      </p>
    </div>
  );
}
