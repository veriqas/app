import { Bot, Scale, ScanLine, UserCheck, ChevronRight } from "lucide-react";

/**
 * The four layers, shown as what each one actually concluded for this case.
 *
 * AI proposes. Policy constrains. Scanners prove. Human approves.
 *
 * A reviewer should be able to read the whole decision in one line before
 * deciding how far down the page they need to go.
 */
export interface ChainState {
  aiStrategy: string | null;
  policyPermitted: boolean | null;   // null = policy not applied (pre-policy attempt)
  policyVersion: string | null;
  verdict: string | null;
  humanDecision: "PENDING" | "APPROVED" | "REJECTED";
}

const VERDICT_TONE: Record<string, "good" | "bad" | "neutral"> = {
  VERIFIED: "good", VERIFIED_WITH_WARNINGS: "good",
  FAILED: "bad", REGRESSED: "bad", BUILD_FAILED: "bad", TEST_FAILED: "bad",
  SCAN_FAILED: "bad", TIMEOUT: "bad", VERIFICATION_ERROR: "bad", NO_BASELINE: "neutral",
};

export function DecisionChain({ state, strategyLabel }: { state: ChainState; strategyLabel: (s?: string | null) => string }) {
  const tone = state.verdict ? VERDICT_TONE[state.verdict] ?? "neutral" : "neutral";
  const steps = [
    {
      icon: Bot, label: "AI proposed",
      value: state.aiStrategy ? strategyLabel(state.aiStrategy) : "No plan yet",
      tone: "neutral" as const,
    },
    {
      icon: Scale, label: "Policy",
      value: state.policyPermitted === null
        ? "Not applied"
        : state.policyPermitted ? `Within policy${state.policyVersion ? ` v${state.policyVersion}` : ""}` : "Rejected — out of policy",
      tone: state.policyPermitted === null ? ("neutral" as const) : state.policyPermitted ? ("good" as const) : ("bad" as const),
    },
    {
      icon: ScanLine, label: "Scanners",
      value: state.verdict ? state.verdict.replace(/_/g, " ").toLowerCase() : "Not verified",
      tone,
    },
    {
      icon: UserCheck, label: "Human",
      value: state.humanDecision === "PENDING" ? "Review required" : state.humanDecision.toLowerCase(),
      tone: state.humanDecision === "APPROVED" ? ("good" as const) : ("neutral" as const),
    },
  ];

  const colors = {
    good:    { fg: "#15803D", bg: "#DCFCE7" },
    bad:     { fg: "#B91C1C", bg: "#FEE2E2" },
    neutral: { fg: "#475569", bg: "#F1F5F9" },
  };

  return (
    <section className="rounded-2xl bg-white p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        AI proposes · Policy constrains · Scanners prove · Human approves
      </p>
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        {steps.map((s, i) => {
          const c = colors[s.tone];
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex flex-1 items-center gap-2">
              <div className="flex-1 rounded-xl px-3.5 py-3" style={{ background: c.bg }}>
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" style={{ color: c.fg }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: c.fg, opacity: 0.75 }}>
                    {s.label}
                  </span>
                </div>
                <p className="mt-1 text-[13px] font-semibold capitalize leading-tight" style={{ color: c.fg }}>
                  {s.value}
                </p>
              </div>
              {i < steps.length - 1 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 md:block" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
