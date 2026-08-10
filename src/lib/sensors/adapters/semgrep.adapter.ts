/**
 * Semgrep adapter — https://semgrep.dev
 * Extensible code sensor for cryptographic usage detection.
 * Results are STATIC_DETECTION only — never proof of live cryptographic use.
 * EvidenceSource: STATIC_DETECTION
 *
 * SENQOR ships its own semgrep rules in /scan-rules/semgrep/.
 * Results from third-party rulesets are accepted but marked lower confidence.
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── Semgrep JSON output shape ──────────────────────────────────────────────────

interface SemgrepResult {
  check_id?: string;
  path?: string;
  start?: { line?: number; col?: number };
  end?: { line?: number; col?: number };
  extra?: {
    message?: string;
    severity?: "ERROR" | "WARNING" | "INFO";
    metadata?: {
      // SENQOR-owned rule metadata keys
      senqor_algorithm?: string;
      senqor_primitive?: string;
      senqor_quantum_class?: string;
      senqor_purpose?: string;
      senqor_confidence?: number;
      senqor_rule_set?: "SENQOR_OWNED" | "COMMUNITY" | "PRO";
      // Generic metadata
      cwe?: string[];
      owasp?: string[];
      references?: string[];
      technology?: string[];
    };
    lines?: string;
  };
}

export interface SemgrepOutput {
  version?: string;
  results?: SemgrepResult[];
  errors?: unknown[];
  stats?: { total_finding_count?: number };
}

// ── Confidence adjustment by rule ownership ────────────────────────────────────

function ruleSetConfidenceAdjust(ruleSet?: string): number {
  // SENQOR-owned rules are tuned for crypto detection — full weight
  if (ruleSet === "SENQOR_OWNED") return 0;
  // Community / pro rules may have false positives — reduce weight
  if (ruleSet === "COMMUNITY") return -10;
  if (ruleSet === "PRO") return -5;
  return -10; // unknown provenance
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const semgrepAdapter: SensorAdapter<SemgrepOutput> = {
  sensorType: "SEMGREP",
  displayName: "Semgrep",
  evidenceSource: "STATIC_DETECTION",

  validate(raw): raw is SemgrepOutput {
    return typeof raw === "object" && raw !== null &&
      ("results" in raw || "version" in raw);
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const result of raw.results ?? []) {
        const meta = result.extra?.metadata ?? {};

        // Algorithm: prefer SENQOR rule annotation, fall back to rule ID extraction
        const algoRaw = meta.senqor_algorithm ?? extractAlgoFromRuleId(result.check_id ?? "");
        if (!algoRaw) continue;  // Skip findings with no algorithm context

        const crypto = normalizeCrypto(algoRaw);
        const quantumClass = meta.senqor_quantum_class
          ? (meta.senqor_quantum_class as import("../types/observation").QuantumClass)
          : crypto.quantumClass;

        const baseConf = computeConfidence("STATIC_DETECTION", meta.senqor_confidence, 0);
        const adj = ruleSetConfidenceAdjust(meta.senqor_rule_set);
        const confidence = Math.max(10, Math.min(100, baseConf + adj));

        obs.push({
          sensorType: ctx.sensorType,
          evidenceSource: "STATIC_DETECTION",
          observedAt: ctx.scannedAt,
          algorithm: crypto.algorithm,
          algorithmRaw: algoRaw,
          primitiveType: meta.senqor_primitive
            ? (normalizeCrypto(meta.senqor_primitive).primitiveType ?? crypto.primitiveType)
            : crypto.primitiveType,
          quantumClass,
          keySize: crypto.keySize,
          curve: crypto.curve,
          filePath: result.path,
          lineNumber: result.start?.line,
          purpose: meta.senqor_purpose,
          context: result.extra?.message,
          confidence,
          rawPayload: result,
          notes: `Rule: ${result.check_id ?? "?"}. Semgrep findings are STATIC_DETECTION only.`,
        });
      }
    } catch (e) {
      console.error("[SemgrepAdapter] normalize failed:", e);
    }
    return obs;
  },
};

// ── Extract algorithm from rule ID convention ──────────────────────────────────
// SENQOR rules follow: senqor.crypto.<algorithm>.<pattern>
// e.g. "senqor.crypto.rsa-2048.weak-key"

function extractAlgoFromRuleId(ruleId: string): string | undefined {
  const match = ruleId.match(/(?:crypto|cryptography)[\._-]([a-zA-Z0-9_\-+]+)/i);
  return match?.[1];
}
