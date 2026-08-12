"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, ArrowRight, ChevronRight } from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  hint: string;
  navHref: string;
  navLabel: string;
  spotlightSelector?: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to VERIQAS",
    description: "This is your Quantum Readiness Dashboard. At a glance you can see your overall readiness score, quantum exposure, and top risks across your organisation.",
    hint: "The score updates automatically each time a scanner completes a job.",
    navHref: "/dashboard",
    navLabel: "Dashboard",
  },
  {
    title: "Connect Your Sensors",
    description: "Sensors are the scanners that discover cryptographic usage across your estate. Start by adding a target — a GitHub repo URL, IP address, or hostname — and running your first scan.",
    hint: "CRYPTOSCAN and CRYPTODEPS run inside the platform. NMAP, SSLYZE, GITLEAKS and others require the target to be reachable from this server.",
    navHref: "/discovery/sensors",
    navLabel: "Sensors",
  },
  {
    title: "Review Assessments",
    description: "Each scan creates an Assessment. You can track scan history, see which sensors ran, how many findings were produced, and drill into the raw results.",
    hint: "Click any assessment row to see the full scan log and individual observations.",
    navHref: "/discovery/assessments",
    navLabel: "Assessments",
  },
  {
    title: "Explore Observations",
    description: "Observations are individual cryptographic findings — an MD5 hash function in a file, an RSA-2048 key in a TLS certificate, a weak cipher in an SSH config. Each one is classified by quantum risk.",
    hint: "Quantum Vulnerable findings are the highest priority — they are breakable by a cryptographically-relevant quantum computer.",
    navHref: "/discovery/observations",
    navLabel: "Observations",
  },
  {
    title: "AI-Powered Remediation",
    description: "For any Quantum Vulnerable code finding, click Remediate. The AI agent clones the repository, reads the file, and proposes a post-quantum migration patch for your review.",
    hint: "You always approve or reject the patch before anything touches your codebase. Nothing is applied automatically.",
    navHref: "/discovery/observations",
    navLabel: "Observations",
  },
  {
    title: "Manage Risks",
    description: "Risks capture the business impact of your cryptographic exposure. Link observations to risks, assign owners, set residual ratings, and track closure over time.",
    hint: "Open critical risks lower your Readiness Score — closing them improves it immediately on the next score calculation.",
    navHref: "/risks",
    navLabel: "Risks",
  },
  {
    title: "Track Your Suppliers",
    description: "Third-party and supply-chain quantum risk is a major exposure. Add your critical suppliers, assess their quantum readiness, and track whether they have a PQC migration plan.",
    hint: "Critical suppliers with no assessment will drag your Third-Party Readiness dimension down.",
    navHref: "/suppliers",
    navLabel: "Suppliers",
  },
  {
    title: "Compliance Frameworks",
    description: "Map your posture to NIST PQC, CNSA 2.0, UK NCSC PQC guidance, and other frameworks. Track alignment percentage and assign actions to close gaps.",
    hint: "Framework alignment contributes directly to your Governance Maturity score dimension.",
    navHref: "/compliance",
    navLabel: "Compliance",
  },
  {
    title: "Actions & Ownership",
    description: "Actions are tasks assigned to people in your organisation. Link them to risks, frameworks, or observations so every remediation effort has a clear owner and due date.",
    hint: "Completed actions improve your Governance score. Overdue actions penalise it.",
    navHref: "/actions",
    navLabel: "Actions",
  },
  {
    title: "You're ready to go",
    description: "Start by running your first scan from the Sensors page. Your dashboard will populate as findings come in and scores will be calculated automatically.",
    hint: "Tip: run CRYPTOSCAN against a GitHub repository to see results within seconds.",
    navHref: "/discovery/sensors",
    navLabel: "Go to Sensors",
  },
];

const STORAGE_KEY = "veriqas_tour_complete";

export function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Small delay so the dashboard has time to render
      const t = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "1");
  }, []);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      dismiss();
      router.push("/discovery/sensors");
      return;
    }
    const nextStep = step + 1;
    setStep(nextStep);
    if (STEPS[nextStep].navHref !== pathname) {
      router.push(STEPS[nextStep].navHref);
    }
  }, [step, dismiss, router, pathname]);

  if (!active) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Tour card */}
      <div className="fixed bottom-8 right-8 z-50 w-[380px] rounded-2xl shadow-2xl overflow-hidden"
        style={{ border: "1px solid rgba(248,120,30,0.3)", background: "#0C1524" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg"
              style={{ background: "rgba(248,120,30,0.15)" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#f8781e" }}>
                {step + 1}
              </span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#f8781e", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Getting Started
            </span>
          </div>
          <button onClick={dismiss}
            className="rounded-lg p-1 transition-colors hover:bg-white/10"
            title="Skip tour">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Step progress dots */}
        <div className="flex items-center gap-1.5 px-5 pt-4">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background: i <= step ? "#f8781e" : "rgba(255,255,255,0.1)",
              }} />
          ))}
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.01em", marginBottom: "8px" }}>
            {current.title}
          </h3>
          <p style={{ fontSize: "13px", color: "#94A3B8", lineHeight: "1.6" }}>
            {current.description}
          </p>

          {/* Hint box */}
          <div className="mt-4 rounded-xl px-3.5 py-3"
            style={{ background: "rgba(248,120,30,0.07)", border: "1px solid rgba(248,120,30,0.15)" }}>
            <div className="flex items-start gap-2">
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#f8781e" }} />
              <p style={{ fontSize: "12px", color: "#CBD5E1", lineHeight: "1.5" }}>
                {current.hint}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-5">
          <button onClick={dismiss}
            style={{ fontSize: "12px", color: "#475569" }}
            className="hover:text-slate-300 transition-colors">
            Skip tour
          </button>

          <button onClick={next}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "#f8781e", color: "#0C1524" }}>
            {isLast ? (
              <>Go to Sensors <ArrowRight className="h-4 w-4" /></>
            ) : (
              <>Next: {STEPS[step + 1].navLabel} <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
