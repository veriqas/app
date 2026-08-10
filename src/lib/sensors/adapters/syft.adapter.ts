/**
 * Syft adapter — https://github.com/anchore/syft
 * Normalises Syft CycloneDX JSON SBOM output into SENQOR observations.
 *
 * Syft produces a general-purpose SBOM. This adapter filters to components
 * that are cryptographic libraries or contain crypto-relevant metadata.
 *
 * EvidenceSource: DEPENDENCY_INFERENCE
 *
 * Note: The existing cbomkit adapter handles CycloneDX *crypto-specific* BOMs
 * from CBOMkit. This adapter handles *general-purpose* SBOMs from Syft where
 * we infer cryptographic relevance from package names and properties.
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { lookupAlgorithm } from "../normalizer/algorithm-registry";
import { computeConfidence } from "../normalizer/confidence-model";

// ── CycloneDX component shape (subset relevant to Syft output) ────────────────

interface CycloneDxProperty {
  name?: string;
  value?: string;
}

interface CycloneDxExternalRef {
  type?: string;
  url?: string;
}

interface CycloneDxComponent {
  type?: string;
  "bom-ref"?: string;
  name?: string;
  version?: string;
  purl?: string;
  licenses?: Array<{ license?: { id?: string; name?: string } }>;
  properties?: CycloneDxProperty[];
  externalReferences?: CycloneDxExternalRef[];
  cryptoProperties?: {
    assetType?: string;
    algorithmProperties?: {
      primitive?: string;
      parameterSetIdentifier?: string;
      curve?: string;
      executionEnvironment?: string;
      implementationPlatform?: string;
      certificationLevel?: string[];
      mode?: string;
      padding?: string;
      cryptoFunctions?: string[];
      classical?: boolean;
      nistQuantumSecurityLevel?: number;
    };
  };
}

export interface SyftCycloneDxOutput {
  bomFormat?: string;
  specVersion?: string;
  serialNumber?: string;
  version?: number;
  metadata?: {
    component?: CycloneDxComponent;
    tools?: unknown;
  };
  components?: CycloneDxComponent[];
}

// ── Crypto-relevant package name patterns ─────────────────────────────────────

const CRYPTO_PACKAGE_RE =
  /openssl|libssl|libcrypto|gnutls|nss-|libnss|gcrypt|libgcrypt|bouncy.?castle|bcprov|bcpkix|cryptography|pycrypto|paramiko|golang\.org\/x\/crypto|javax\.crypto|java\.security|liboqs|oqs-|pqcrypto|node-forge|mbedtls|wolfssl|botan|nettle/i;

// Map well-known crypto library names to their typical algorithm
const CRYPTO_LIB_ALGO: Record<string, string> = {
  openssl:        "RSA-2048",
  libssl:         "RSA-2048",
  libcrypto:      "RSA-2048",
  gnutls:         "RSA-2048",
  nss:            "RSA-2048",
  liboqs:         "ML-KEM-768",
  "oqs-provider": "ML-KEM-768",
  pqcrypto:       "ML-KEM-768",
  mbedtls:        "RSA-2048",
  wolfssl:        "RSA-2048",
  botan:          "RSA-2048",
};

function guessAlgoFromName(name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [lib, algo] of Object.entries(CRYPTO_LIB_ALGO)) {
    if (lower.includes(lib)) return algo;
  }
  return undefined;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const syftAdapter: SensorAdapter<SyftCycloneDxOutput> = {
  sensorType: "SYFT",
  displayName: "Syft",
  evidenceSource: "DEPENDENCY_INFERENCE",

  validate(raw): raw is SyftCycloneDxOutput {
    return (
      typeof raw === "object" &&
      raw !== null &&
      "bomFormat" in raw &&
      (raw as Record<string, unknown>).bomFormat === "CycloneDX"
    );
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    const target = raw.metadata?.component?.name ?? "";

    try {
      for (const component of raw.components ?? []) {
        const name = component.name ?? "";
        const version = component.version ?? "";

        // Case 1: component has explicit cryptoProperties (CycloneDX 1.4+ CBOM extension)
        const cp = component.cryptoProperties;
        if (cp?.algorithmProperties) {
          const ap = cp.algorithmProperties;
          const paramSet = ap.parameterSetIdentifier ?? "";
          const prim = ap.primitive ?? "";
          const algoRaw = paramSet || prim;
          const algo = algoRaw ? lookupAlgorithm(algoRaw) : undefined;
          const crypto = algo ? normalizeCrypto(algo.name) : normalizeCrypto(name);

          obs.push({
            sensorType: ctx.sensorType,
            evidenceSource: ctx.evidenceSource,
            observedAt: ctx.scannedAt,
            algorithm: crypto.algorithm,
            algorithmRaw: algoRaw || name,
            primitiveType: crypto.primitiveType,
            quantumClass: crypto.quantumClass,
            parameterSet: paramSet || undefined,
            curve: ap.curve || undefined,
            packageName: name,
            packageVersion: version,
            filePath: target,
            context: `CycloneDX cryptoProperties — ${cp.assetType ?? "algorithm"}`,
            confidence: computeConfidence("DEPENDENCY_INFERENCE", undefined, 0),
            rawPayload: component,
          });
          continue;
        }

        // Case 2: component name matches a known crypto library
        if (!CRYPTO_PACKAGE_RE.test(name)) continue;

        const guessedAlgo = guessAlgoFromName(name);
        const crypto = guessedAlgo ? normalizeCrypto(guessedAlgo) : null;

        obs.push({
          sensorType: ctx.sensorType,
          evidenceSource: ctx.evidenceSource,
          observedAt: ctx.scannedAt,
          algorithm: crypto?.algorithm,
          primitiveType: crypto?.primitiveType ?? undefined,
          quantumClass: crypto?.quantumClass ?? "UNKNOWN",
          packageName: name,
          packageVersion: version,
          filePath: target,
          context: `Cryptographic package in SBOM (${component.type ?? "library"})`,
          confidence: computeConfidence("DEPENDENCY_INFERENCE", undefined, 0),
          rawPayload: { name, version, purl: component.purl },
          provider: component.purl ?? `${name} ${version}`,
        });
      }
    } catch (e) {
      console.error("[SyftAdapter] normalize failed:", e);
    }

    return obs;
  },
};
