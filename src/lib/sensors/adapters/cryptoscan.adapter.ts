/**
 * CryptoScan adapter — https://github.com/csnp/cryptoscan
 * Source code and configuration cryptographic discovery.
 * EvidenceSource: STATIC_DETECTION
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── CryptoScan JSON output shape ───────────────────────────────────────────────

export interface CryptoScanFinding {
  pattern_id?: string;
  category?: string;
  severity?: string;
  quantum_risk?: "VULNERABLE" | "PARTIAL" | "HYBRID" | "SAFE" | "UNKNOWN";
  algorithm?: string;
  primitive?: string;
  purpose?: string;
  library?: string;
  file?: string;
  line?: number;
  confidence?: number;         // 0–100
  context?: string;
  cbom_ref?: string;
  sarif_ref?: string;
  remediation?: string;
}

export interface CryptoScanOutput {
  tool?: { name: string; version?: string };
  findings: CryptoScanFinding[];
  scan_timestamp?: string;
}

// ── SARIF output shape (partial — only what we need) ──────────────────────────

interface SarifResult {
  ruleId?: string;
  message?: { text?: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: { startLine?: number };
    };
  }>;
  properties?: {
    algorithm?: string;
    quantum_risk?: string;
    confidence?: number;
    primitive?: string;
    library?: string;
    purpose?: string;
  };
}

interface SarifRun {
  results?: SarifResult[];
}

export interface CryptoScanSarifOutput {
  $schema?: string;
  runs?: SarifRun[];
}

// ── Quantum risk mapping ───────────────────────────────────────────────────────

function mapQuantumRisk(qr?: string): import("../types/observation").QuantumClass {
  switch (qr?.toUpperCase()) {
    case "VULNERABLE": return "QUANTUM_VULNERABLE";
    case "PARTIAL":    return "QUANTUM_REDUCED_SECURITY";
    case "HYBRID":     return "HYBRID";
    case "SAFE":       return "POST_QUANTUM";
    default:           return "UNKNOWN";
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const cryptoScanAdapter: SensorAdapter<CryptoScanOutput | CryptoScanSarifOutput> = {
  sensorType: "CRYPTOSCAN",
  displayName: "CryptoScan",
  evidenceSource: "STATIC_DETECTION",

  validate(raw): raw is CryptoScanOutput | CryptoScanSarifOutput {
    if (typeof raw !== "object" || raw === null) return false;
    // JSON format has "findings" array; SARIF has "runs" array
    return "findings" in raw || ("$schema" in raw && "runs" in raw);
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    try {
      // SARIF format
      if ("runs" in raw && Array.isArray((raw as CryptoScanSarifOutput).runs)) {
        return normalizeSarif(raw as CryptoScanSarifOutput, ctx);
      }
      // JSON format
      return normalizeJson(raw as CryptoScanOutput, ctx);
    } catch (e) {
      console.error("[CryptoScanAdapter] normalize failed:", e);
      return [];
    }
  },
};

function normalizeJson(raw: CryptoScanOutput, ctx: ScanContext): SenqorObservation[] {
  return (raw.findings ?? []).map((f): SenqorObservation => {
    const algoRaw = f.algorithm ?? f.primitive ?? "UNKNOWN";
    const crypto = normalizeCrypto(algoRaw);
    const confidence = computeConfidence("STATIC_DETECTION", f.confidence, 0);

    return {
      sensorType: ctx.sensorType,
      evidenceSource: "STATIC_DETECTION",
      observedAt: ctx.scannedAt,
      algorithm: crypto.algorithm,
      algorithmRaw: algoRaw,
      primitiveType: crypto.primitiveType,
      quantumClass: mapQuantumRisk(f.quantum_risk) !== "UNKNOWN"
        ? mapQuantumRisk(f.quantum_risk)
        : crypto.quantumClass,
      keySize: crypto.keySize,
      curve: crypto.curve,
      provider: f.library,
      purpose: f.purpose,
      filePath: f.file,
      lineNumber: f.line,
      context: f.context ?? f.category,
      confidence,
      rawPayload: f,
      notes: f.remediation,
    };
  });
}

function normalizeSarif(raw: CryptoScanSarifOutput, ctx: ScanContext): SenqorObservation[] {
  const obs: SenqorObservation[] = [];
  for (const run of raw.runs ?? []) {
    for (const result of run.results ?? []) {
      const props = result.properties ?? {};
      const algoRaw = props.algorithm ?? result.ruleId ?? "UNKNOWN";
      const crypto = normalizeCrypto(algoRaw);
      const loc = result.locations?.[0]?.physicalLocation;
      const confidence = computeConfidence("STATIC_DETECTION", props.confidence, 0);

      obs.push({
        sensorType: ctx.sensorType,
        evidenceSource: "STATIC_DETECTION",
        observedAt: ctx.scannedAt,
        algorithm: crypto.algorithm,
        algorithmRaw: algoRaw,
        primitiveType: props.primitive
          ? (normalizeCrypto(props.primitive).primitiveType ?? crypto.primitiveType)
          : crypto.primitiveType,
        quantumClass: mapQuantumRisk(props.quantum_risk) !== "UNKNOWN"
          ? mapQuantumRisk(props.quantum_risk)
          : crypto.quantumClass,
        keySize: crypto.keySize,
        curve: crypto.curve,
        provider: props.library,
        purpose: props.purpose,
        filePath: loc?.artifactLocation?.uri,
        lineNumber: loc?.region?.startLine,
        context: result.message?.text,
        confidence,
        rawPayload: result,
      });
    }
  }
  return obs;
}
