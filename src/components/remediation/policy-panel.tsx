import { ShieldBan, ShieldCheck, Scale, Info } from "lucide-react";

/** Shape persisted by the deterministic strategy policy engine. */
export interface PolicyJson {
  policyVersion?: string;
  inputDigest?: string;
  classification?: {
    purposeCategory?: string;
    quantumSensitive?: boolean;
    publicKeyPrimitive?: boolean;
    evidenceSufficient?: boolean;
    confidenceBand?: string;
    escalated?: boolean;
  };
  permittedStrategies?: string[];
  prohibitedStrategies?: { strategy: string; reason: string }[];
  preferredStrategy?: string | null;
  prohibitedTargets?: string[];
  requiredProperties?: string[];
  rationale?: { rule: string; effect: string; because: string }[];
}

const STRATEGY_LABEL: Record<string, string> = {
  CODE_CHANGE: "Code change",
  DEPENDENCY_UPGRADE: "Dependency upgrade",
  CONFIGURATION_CHANGE: "Configuration change",
  CRYPTOGRAPHIC_MIGRATION: "Cryptographic migration",
  KEY_MIGRATION: "Key migration",
  HYBRID_PQC_MIGRATION: "Hybrid post-quantum migration",
  REMOVE_UNUSED_CRYPTO: "Remove unused cryptography",
  MANUAL_REVIEW: "Manual review",
};
export const strategyLabel = (s?: string | null) => (s ? STRATEGY_LABEL[s] ?? s : "—");

/**
 * What the deterministic policy allowed, and why. This is the layer that turns
 * "the AI suggested something" into "the AI was permitted to suggest this" — so
 * it is shown as a decision of record, with its version and reasoning.
 */
export function PolicyPanel({ policy }: { policy: PolicyJson }) {
  const permitted = policy.permittedStrategies ?? [];
  const prohibited = policy.prohibitedStrategies ?? [];
  const targets = policy.prohibitedTargets ?? [];
  const cls = policy.classification ?? {};

  return (
    <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Policy Decision</h3>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">
          policy v{policy.policyVersion ?? "—"}
        </span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-400">
        Computed from the evidence before the AI was asked to plan. The same evidence always
        produces the same decision.
      </p>

      {/* Classification */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {cls.purposeCategory && (
          <Chip label={String(cls.purposeCategory).replace(/_/g, " ").toLowerCase()} tone="neutral" />
        )}
        {cls.quantumSensitive && <Chip label="quantum sensitive" tone="danger" />}
        {cls.publicKeyPrimitive && <Chip label="public-key primitive" tone="neutral" />}
        {cls.confidenceBand && <Chip label={`evidence ${String(cls.confidenceBand).toLowerCase()}`} tone={cls.confidenceBand === "SUFFICIENT" ? "good" : "warn"} />}
        {cls.escalated && <Chip label="escalated (ambiguous purpose)" tone="warn" />}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Permitted */}
        <div className="rounded-xl border border-green-100 bg-green-50/50 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-green-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Permitted
          </p>
          <ul className="space-y-1">
            {permitted.map(s => (
              <li key={s} className="flex items-center gap-2 text-[13px] text-slate-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {strategyLabel(s)}
                {s === policy.preferredStrategy && (
                  <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                    preferred
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Prohibited */}
        <div className="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-600">
            <ShieldBan className="h-3.5 w-3.5" /> Prohibited
          </p>
          {prohibited.length === 0 ? (
            <p className="text-[13px] text-slate-400">No strategies excluded.</p>
          ) : (
            <ul className="space-y-1.5">
              {prohibited.map(p => (
                <li key={p.strategy} className="text-[13px] text-slate-700">
                  <span className="font-medium">{strategyLabel(p.strategy)}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{p.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Prohibited replacement algorithms — the RSA→Ed25519 guard, made visible */}
      {targets.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Replacements the fix may not use
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(targets.map(t => t.toUpperCase()))).slice(0, 18).map(t => (
              <span key={t} className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-500 line-through">
                {t}
              </span>
            ))}
          </div>
          {(policy.requiredProperties ?? []).length > 0 && (
            <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
              {policy.requiredProperties!.join(" ")}
            </p>
          )}
        </div>
      )}

      {/* Reasoning */}
      {(policy.rationale ?? []).length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-[12px] font-medium text-slate-500 hover:text-slate-700">
            <Info className="mr-1 inline h-3 w-3" />
            Why this decision ({policy.rationale!.length} rules applied)
          </summary>
          <ul className="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3">
            {policy.rationale!.map((r, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-slate-600">
                <code className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">{r.rule}</code>
                {r.because}
              </li>
            ))}
          </ul>
          {policy.inputDigest && (
            <p className="mt-2 pl-3 font-mono text-[10px] text-slate-300">evidence digest {policy.inputDigest}</p>
          )}
        </details>
      )}
    </section>
  );
}

function Chip({ label, tone }: { label: string; tone: "neutral" | "good" | "warn" | "danger" }) {
  const styles: Record<string, { color: string; bg: string }> = {
    neutral: { color: "#475569", bg: "#F1F5F9" },
    good:    { color: "#15803D", bg: "#DCFCE7" },
    warn:    { color: "#B45309", bg: "#FEF3C7" },
    danger:  { color: "#B91C1C", bg: "#FEE2E2" },
  };
  const s = styles[tone];
  return (
    <span className="rounded-md px-2 py-0.5 text-[11px] font-medium capitalize" style={{ color: s.color, background: s.bg }}>
      {label}
    </span>
  );
}
