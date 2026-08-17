// The five AI remediation stages. Each is a separate, strictly-typed structured
// call. Repository context is passed as UNTRUSTED data (wrapped) — never as
// instructions. No stage may declare a remediation verified; only the
// deterministic verification engine does.

import type { AIClient } from "./ai-client";
import { wrapUntrusted } from "./ai-client";
import type { ContextBundle } from "./context-acquirer";
import { lookupAlgorithm } from "./knowledge-base";
import type { StrategyPolicy, Strategy } from "@/lib/remediation/policy/policy-types";

export interface CaseInfo {
  ref: string;
  algorithm: string | null;
  purpose: string | null;
  repoUrl: string | null;
  affectedFiles: string[];
  affectedDependencies: string[];
  evidenceSources: string[];
}

// The strategy vocabulary is owned by the policy layer, which decides which of
// these are admissible for a given case. Re-exported for existing consumers.
export { STRATEGIES } from "@/lib/remediation/policy/policy-types";
export type { Strategy } from "@/lib/remediation/policy/policy-types";

export interface InvestigationResult {
  primitive: string; algorithm: string; operation: string; purpose: string;
  dataProtected: string; isGenuine: boolean; dependents: string[];
  scope: "LOCAL" | "SYSTEMIC"; confidence: number;
}
export interface RootCauseResult {
  rootCause: string; why: string; migrationConstraints: string[];
}
export interface RemediationPlan {
  strategy: Strategy; why: string;
  affectedFiles: string[]; affectedDependencies: string[];
  expectedSecurityImprovement: string; expectedCompatibilityImpact: string;
  verificationRequirements: string[];
}
export interface PatchChange {
  filePath: string; changeType: "MODIFY" | "ADD" | "DELETE" | "DEP_UPGRADE";
  newContent?: string; reason: string;
}
export interface PatchResult { changes: PatchChange[]; notes: string; }
export interface DiagnosisResult {
  failureUnderstanding: string; whichEvidence: string; revisedApproach: string; giveUp: boolean;
}

function contextText(bundle: ContextBundle): string {
  return bundle.files.map(f => `# [${f.role}] ${f.filePath}\n${f.content}`).join("\n\n");
}

export async function investigate(ai: AIClient, p: { caseInfo: CaseInfo; context: ContextBundle }) {
  const kb = lookupAlgorithm(p.caseInfo.algorithm);
  const system = `You are a cryptography investigator. Analyse how the flagged cryptography is actually used. Do NOT modify code.
Return JSON: {"primitive","algorithm","operation","purpose","dataProtected","isGenuine":bool,"dependents":[],"scope":"LOCAL|SYSTEMIC","confidence":0..1}`;
  const user = `Case ${p.caseInfo.ref}: algorithm=${p.caseInfo.algorithm}, purpose=${p.caseInfo.purpose}, scanners=${p.caseInfo.evidenceSources.join(",")}.
Knowledge: ${kb ? kb.note : "n/a"}
${wrapUntrusted("repository context", contextText(p.context))}`;
  return ai.completeJSON<InvestigationResult>({ stage: "INVESTIGATOR", system, user });
}

export async function analyzeRootCause(ai: AIClient, p: { caseInfo: CaseInfo; investigation: InvestigationResult }) {
  const system = `You are a root-cause analyst. Determine WHY this cryptography exists before any change is planned.
Return JSON: {"rootCause","why","migrationConstraints":[]}`;
  const user = `Case ${p.caseInfo.ref}. Investigation: ${JSON.stringify(p.investigation)}`;
  return ai.completeJSON<RootCauseResult>({ stage: "ROOT_CAUSE", system, user });
}

export async function planRemediation(ai: AIClient, p: { caseInfo: CaseInfo; investigation: InvestigationResult; rootCause: RootCauseResult; policy: StrategyPolicy }) {
  const kb = lookupAlgorithm(p.caseInfo.algorithm);
  const pol = p.policy;
  // The policy boundary is stated as a hard constraint. The planner still decides
  // the implementation, the files and the migration mechanics — but not whether a
  // class of remediation is acceptable. That has already been decided.
  const system = `You are a remediation planner. Select the SMALLEST safe strategy that resolves the root cause. Prefer established libraries and NIST standards; never invent cryptography, never weaken security.

A deterministic security policy (version ${pol.policyVersion}) has already established which strategies are admissible for this case. You MUST choose "strategy" from PERMITTED. Choosing anything else is invalid and will be rejected.
PERMITTED: ${pol.permittedStrategies.join(", ")}
${pol.preferredStrategy ? `PREFERRED (unless the evidence argues otherwise): ${pol.preferredStrategy}` : ""}
PROHIBITED STRATEGIES: ${pol.prohibitedStrategies.map(x => `${x.strategy} (${x.reason})`).join(" | ") || "none"}
PROHIBITED REPLACEMENT ALGORITHMS — must not appear in any resulting change: ${pol.prohibitedTargets.join(", ") || "none"}
REQUIRED PROPERTIES OF ANY REPLACEMENT: ${pol.requiredProperties.join(" | ") || "none"}
POLICY RATIONALE: ${pol.rationale.map(r => `${r.rule}: ${r.because}`).join(" | ")}

Return JSON: {"strategy","why","affectedFiles":[],"affectedDependencies":[],"expectedSecurityImprovement","expectedCompatibilityImpact","verificationRequirements":[]}`;
  const user = `Case ${p.caseInfo.ref}. Investigation: ${JSON.stringify(p.investigation)}. RootCause: ${JSON.stringify(p.rootCause)}.
PQC guidance: ${kb ? JSON.stringify({ pqc: kb.pqcAlternatives, hybrid: kb.hybridAlternatives, standards: kb.standards }) : "n/a"}`;
  return ai.completeJSON<RemediationPlan>({ stage: "PLANNER", system, user });
}

export async function generatePatch(ai: AIClient, p: { plan: RemediationPlan; context: ContextBundle; policy?: StrategyPolicy }) {
  const bound = p.policy && p.policy.prohibitedTargets.length > 0
    ? `
The following cryptographic primitives are PROHIBITED and must not appear anywhere in your changes: ${p.policy.prohibitedTargets.join(", ")}.
Any replacement must satisfy: ${p.policy.requiredProperties.join(" | ") || "n/a"}.
Patches introducing a prohibited primitive are rejected before verification.`
    : "";
  const system = `You are a careful patcher. Produce the MINIMAL multi-file changes implementing the plan. Do not modify unrelated code, formatting, or dependencies. Every change needs a reason. For each modified/added file, return its FULL new content.${bound}
Return JSON: {"changes":[{"filePath","changeType":"MODIFY|ADD|DELETE|DEP_UPGRADE","newContent","reason"}],"notes"}`;
  const user = `Plan: ${JSON.stringify(p.plan)}
${wrapUntrusted("current file contents", contextText(p.context))}`;
  // A multi-file migration patch is the largest output any stage produces;
  // 8k proved too small and truncated mid-JSON on a real migration.
  return ai.completeJSON<PatchResult>({ stage: "PATCHER", system, user, maxTokens: 24576 });
}

export async function diagnoseFailure(ai: AIClient, p: { plan: RemediationPlan; evidence: unknown }) {
  const system = `You are a diagnosis analyst. A remediation attempt was NOT verified. Read the deterministic evidence (scanner residual/new findings, build/test results) and propose a revised approach, or give up.
You cannot mark anything verified. Return JSON: {"failureUnderstanding","whichEvidence","revisedApproach","giveUp":bool}`;
  const user = `Previous plan: ${JSON.stringify(p.plan)}
Verification evidence: ${JSON.stringify(p.evidence)}`;
  return ai.completeJSON<DiagnosisResult>({ stage: "DIAGNOSER", system, user });
}
