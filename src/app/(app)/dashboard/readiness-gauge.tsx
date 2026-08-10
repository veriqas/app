"use client";

interface ReadinessGaugeProps {
  score: number;
  change: number | null;
  rating: string;
}

export function ReadinessGauge({ score, change, rating }: ReadinessGaugeProps) {
  const r = 68;
  const cx = 100;
  const cy = 88;
  const startAngle = -215;
  const endAngle = 35;
  const totalAngle = endAngle - startAngle;
  const scoreAngle = startAngle + (score / 100) * totalAngle;

  function polar(angle: number, radius: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arc(a1: number, a2: number, rad: number) {
    const s = polar(a1, rad);
    const e = polar(a2, rad);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${rad} ${rad} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const arcColor =
    score >= 80 ? "#f8781e"
    : score >= 60 ? "#F59E0B"
    : score >= 40 ? "#F97316"
    : "#EF4444";

  const tip = score > 0 ? polar(scoreAngle, r) : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 115" className="w-[200px]">
        {/* Track */}
        <path
          d={arc(startAngle, endAngle, r)}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Score arc */}
        {score > 0 && (
          <path
            d={arc(startAngle, scoreAngle, r)}
            fill="none"
            stroke={arcColor}
            strokeWidth="10"
            strokeLinecap="round"
          />
        )}
        {/* Tip dot */}
        {tip && (
          <>
            <circle cx={tip.x} cy={tip.y} r="9" fill={arcColor} opacity="0.15" />
            <circle cx={tip.x} cy={tip.y} r="5" fill={arcColor} />
          </>
        )}
        {/* Score number */}
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="38"
          fontWeight="800"
          fontFamily="var(--font-montserrat), Montserrat, sans-serif"
          letterSpacing="-1"
        >
          {Math.round(score)}
        </text>
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          fill="rgba(141,160,184,0.6)"
          fontSize="10"
          fontWeight="500"
          fontFamily="var(--font-montserrat), Montserrat, sans-serif"
        >
          / 100
        </text>
      </svg>

      <p
        className="mt-0 text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: arcColor }}
      >
        {rating}
      </p>
      {change !== null && (
        <p
          className="mt-1.5 text-[11px] font-semibold"
          style={{ color: change >= 0 ? "#10B981" : "#EF4444" }}
        >
          {change >= 0 ? "▲ +" : "▼ "}{change} since previous period
        </p>
      )}
    </div>
  );
}
