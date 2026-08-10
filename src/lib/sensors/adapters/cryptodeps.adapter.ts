/**
 * CryptoDeps adapter — https://github.com/csnp/cryptodeps
 * Cryptographic dependency and software supply-chain analysis.
 * EvidenceSource: DEPENDENCY_INFERENCE
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── CryptoDeps JSON output shape ───────────────────────────────────────────────

export type Reachability = "CONFIRMED" | "REACHABLE" | "AVAILABLE";

export interface CryptoDepsAlgorithmUsage {
  algorithm: string;
  quantum_risk?: "VULNERABLE" | "PARTIAL" | "SAFE" | "UNKNOWN";
  usage_context?: string;
  reachability?: Reachability;
  primitive?: string;
  call_context?: string;
}

export interface CryptoDepsFinding {
  package: string;
  version?: string;
  dependency_path?: string[];       // chain from root to this package
  direct?: boolean;
  crypto_implementations?: CryptoDepsAlgorithmUsage[];
  severity?: string;
  timeline?: string;
  remediation?: string;
}

export interface CryptoDepsOutput {
  tool?: { name: string; version?: string };
  scanned_at?: string;
  findings: CryptoDepsFinding[];
}

// ── CycloneDX CBOM shape (subset CryptoDeps may emit) ─────────────────────────

interface CbomComponent {
  type?: string;
  name?: string;
  version?: string;
  "bom-ref"?: string;
  cryptoProperties?: {
    assetType?: string;
    algorithmProperties?: {
      primitive?: string;
      parameterSetIdentifier?: string;
      curve?: string;
      executionEnvironment?: string;
      implementationPlatform?: string;
      certificationLevel?: string[];
      classicalSecurityLevel?: number;
      nistQuantumSecurityLevel?: number;
    };
  };
  evidence?: {
    occurrences?: Array<{ location: string; line?: number }>;
  };
}

export interface CryptoDipsCbomOutput {
  bomFormat?: string;
  specVersion?: string;
  components?: CbomComponent[];
}

// ── Confidence by reachability ────────────────────────────────────────────────

function reachabilityBonus(r?: Reachability): number {
  if (r === "CONFIRMED") return 15;
  if (r === "REACHABLE") return 5;
  return 0;
}

function mapQuantumRisk(qr?: string): import("../types/observation").QuantumClass {
  switch (qr?.toUpperCase()) {
    case "VULNERABLE": return "QUANTUM_VULNERABLE";
    case "PARTIAL":    return "QUANTUM_REDUCED_SECURITY";
    case "SAFE":       return "POST_QUANTUM";
    default:           return "UNKNOWN";
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const cryptoDepsAdapter: SensorAdapter<CryptoDepsOutput | CryptoDipsCbomOutput> = {
  sensorType: "CRYPTODEPS",
  displayName: "CryptoDeps",
  evidenceSource: "DEPENDENCY_INFERENCE",

  validate(raw): raw is CryptoDepsOutput | CryptoDipsCbomOutput {
    if (typeof raw !== "object" || raw === null) return false;
    return "findings" in raw || "bomFormat" in raw;
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    try {
      if ("bomFormat" in raw) return normalizeCbom(raw as CryptoDipsCbomOutput, ctx);
      return normalizeJson(raw as CryptoDepsOutput, ctx);
    } catch (e) {
      console.error("[CryptoDepsAdapter] normalize failed:", e);
      return [];
    }
  },
};

function normalizeJson(raw: CryptoDepsOutput, ctx: ScanContext): SenqorObservation[] {
  const obs: SenqorObservation[] = [];
  for (const f of raw.findings ?? []) {
    for (const usage of f.crypto_implementations ?? []) {
      const crypto = normalizeCrypto(usage.algorithm);
      const base = computeConfidence("DEPENDENCY_INFERENCE", undefined, 0);
      const confidence = Math.min(100, base + reachabilityBonus(usage.reachability));

      obs.push({
        sensorType: ctx.sensorType,
        evidenceSource: "DEPENDENCY_INFERENCE",
        observedAt: ctx.scannedAt,
        algorithm: crypto.algorithm,
        algorithmRaw: usage.algorithm,
        primitiveType: usage.primitive
          ? (normalizeCrypto(usage.primitive).primitiveType ?? crypto.primitiveType)
          : crypto.primitiveType,
        quantumClass: mapQuantumRisk(usage.quantum_risk) !== "UNKNOWN"
          ? mapQuantumRisk(usage.quantum_risk)
          : crypto.quantumClass,
        keySize: crypto.keySize,
        curve: crypto.curve,
        packageName: f.package,
        packageVersion: f.version,
        dependencyPath: f.dependency_path,
        context: usage.usage_context ?? usage.call_context,
        confidence,
        rawPayload: { finding: f, usage },
        notes: f.remediation,
      });
    }
  }
  return obs;
}

function normalizeCbom(raw: CryptoDipsCbomOutput, ctx: ScanContext): SenqorObservation[] {
  const obs: SenqorObservation[] = [];
  for (const c of raw.components ?? []) {
    if (!c.cryptoProperties) continue;
    const algoRaw = c.name ?? "UNKNOWN";
    const crypto = normalizeCrypto(algoRaw);
    const props = c.cryptoProperties.algorithmProperties ?? {};

    obs.push({
      sensorType: ctx.sensorType,
      evidenceSource: "CBOM_IMPORT",
      observedAt: ctx.scannedAt,
      algorithm: crypto.algorithm,
      algorithmRaw: algoRaw,
      primitiveType: props.primitive
        ? (normalizeCrypto(props.primitive).primitiveType ?? crypto.primitiveType)
        : crypto.primitiveType,
      quantumClass: crypto.quantumClass,
      keySize: crypto.keySize,
      curve: props.curve ?? crypto.curve,
      parameterSet: props.parameterSetIdentifier ?? crypto.parameterSet,
      packageName: c.name,
      packageVersion: c.version,
      context: c.cryptoProperties.assetType,
      confidence: computeConfidence("CBOM_IMPORT", undefined, 0),
      rawPayload: c,
    });
  }
  return obs;
}
