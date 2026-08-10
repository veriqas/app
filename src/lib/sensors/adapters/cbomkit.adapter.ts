/**
 * CBOMkit / CycloneDX CBOM adapter — https://github.com/PQCA/cbomkit
 * Cryptographic Bill of Materials ingestion.
 * EvidenceSource: CBOM_IMPORT
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto, inferFromCipherSuite } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";
import type { PrimitiveType, QuantumClass } from "../types/observation";

// ── CycloneDX 1.5/1.6 CBOM component shape ────────────────────────────────────

type CbomAssetType =
  | "algorithm"
  | "certificate"
  | "relatedCryptoMaterial"
  | "protocol"
  | "other";

interface CbomAlgorithmProperties {
  primitive?: string;
  parameterSetIdentifier?: string;
  variant?: string;
  curve?: string;
  executionEnvironment?: string;
  implementationPlatform?: string;
  certificationLevel?: string[];
  classicalSecurityLevel?: number;
  nistQuantumSecurityLevel?: number;
  cryptoFunctions?: string[];
}

interface CbomComponent {
  type?: string;
  "bom-ref"?: string;
  name?: string;
  version?: string;
  purl?: string;
  description?: string;
  cryptoProperties?: {
    assetType?: CbomAssetType;
    algorithmProperties?: CbomAlgorithmProperties;
    certificateProperties?: {
      subjectName?: string;
      issuerName?: string;
      notValidBefore?: string;
      notValidAfter?: string;
      signatureAlgorithmRef?: string;
      subjectPublicKeyRef?: string;
      certificateFormat?: string;
      certificateExtension?: string;
    };
    relatedCryptoMaterialProperties?: {
      type?: string;
      id?: string;
      state?: string;
      algorithmRef?: string;
      creationDate?: string;
      activationDate?: string;
      expirationDate?: string;
      size?: number;
      format?: string;
      securedBy?: { mechanism?: string; algorithmRef?: string };
    };
    protocolProperties?: {
      type?: string;
      version?: string;
      cipherSuites?: Array<{
        name?: string;
        algorithms?: string[];
        identifiers?: string[];
      }>;
      ikev2TransformTypes?: unknown;
      cryptoRefArray?: string[];
    };
    oid?: string;
  };
  evidence?: {
    occurrences?: Array<{ location?: string; line?: number; offset?: number; symbol?: string }>;
    callstack?: unknown;
    identity?: unknown;
  };
}

export interface CbomDocument {
  bomFormat?: string;
  specVersion?: string;
  version?: number;
  metadata?: {
    timestamp?: string;
    tools?: Array<{ vendor?: string; name?: string; version?: string }>;
    component?: { name?: string; version?: string };
  };
  components?: CbomComponent[];
  dependencies?: Array<{ ref?: string; dependsOn?: string[] }>;
}

// ── NIST quantum security level → QuantumClass ─────────────────────────────────

function nistQslToQuantumClass(level?: number, primitive?: string): QuantumClass {
  if (level === undefined) return "UNKNOWN";
  if (level >= 1) return "POST_QUANTUM";
  const p = primitive?.toUpperCase() ?? "";
  if (p.includes("SYMMETRIC") || p.includes("HASH") || p.includes("MAC")) {
    return "QUANTUM_RESILIENT";
  }
  return "QUANTUM_VULNERABLE";
}

// ── Asset type → primitive type ────────────────────────────────────────────────

function assetTypeToPrimitive(assetType?: CbomAssetType, algoProps?: CbomAlgorithmProperties): PrimitiveType {
  if (assetType === "certificate") return "CERTIFICATE";
  if (assetType === "protocol") return "OTHER";
  if (algoProps?.primitive) {
    const p = normalizeCrypto(algoProps.primitive);
    if (p.primitiveType) return p.primitiveType;
  }
  return "OTHER";
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const cbomkitAdapter: SensorAdapter<CbomDocument> = {
  sensorType: "CBOMKIT",
  displayName: "CBOMkit / CycloneDX",
  evidenceSource: "CBOM_IMPORT",

  validate(raw): raw is CbomDocument {
    return typeof raw === "object" && raw !== null &&
      (
        (raw as Record<string, unknown>).bomFormat === "CycloneDX" ||
        "components" in raw
      );
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      const scanTs = raw.metadata?.timestamp
        ? new Date(raw.metadata.timestamp)
        : ctx.scannedAt;

      for (const component of raw.components ?? []) {
        const cp = component.cryptoProperties;
        if (!cp) continue;

        const algoRaw = component.name ?? "UNKNOWN";
        const crypto = normalizeCrypto(algoRaw);
        const algoProps = cp.algorithmProperties;
        const primitiveType = assetTypeToPrimitive(cp.assetType, algoProps);
        const quantumClass = algoProps?.nistQuantumSecurityLevel !== undefined
          ? nistQslToQuantumClass(algoProps.nistQuantumSecurityLevel, algoProps.primitive)
          : crypto.quantumClass;

        // First occurrence for file/line
        const firstOccurrence = component.evidence?.occurrences?.[0];

        obs.push({
          sensorType: ctx.sensorType,
          evidenceSource: "CBOM_IMPORT",
          observedAt: scanTs,
          algorithm: crypto.algorithm,
          algorithmRaw: algoRaw,
          primitiveType,
          quantumClass,
          keySize: algoProps?.classicalSecurityLevel ?? crypto.keySize,
          curve: algoProps?.curve ?? crypto.curve,
          parameterSet: algoProps?.parameterSetIdentifier ?? crypto.parameterSet,
          filePath: firstOccurrence?.location,
          lineNumber: firstOccurrence?.line,
          context: cp.assetType === "protocol"
            ? `CBOM protocol: ${cp.protocolProperties?.type ?? ""}`
            : `CBOM ${cp.assetType ?? "algorithm"}`,
          confidence: computeConfidence("CBOM_IMPORT", undefined, 0),
          rawPayload: component,
          notes: component.description,
        });

        // For protocol components, emit per-cipher-suite observations
        if (cp.assetType === "protocol" && cp.protocolProperties?.cipherSuites) {
          for (const suite of cp.protocolProperties.cipherSuites) {
            if (!suite.name) continue;
            const parts = inferFromCipherSuite(suite.name);
            const kex = parts.keyExchange;
            if (kex) {
              const c = normalizeCrypto(kex);
              obs.push({
                sensorType: ctx.sensorType,
                evidenceSource: "CBOM_IMPORT",
                observedAt: scanTs,
                algorithm: c.algorithm,
                algorithmRaw: kex,
                primitiveType: "KEY_ESTABLISHMENT",
                quantumClass: c.quantumClass,
                keySize: c.keySize,
                curve: c.curve,
                protocol: cp.protocolProperties.type,
                context: suite.name,
                confidence: computeConfidence("CBOM_IMPORT", undefined, 0),
                rawPayload: suite,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("[CbomkitAdapter] normalize failed:", e);
    }
    return obs;
  },
};
