/**
 * Trivy adapter — https://github.com/aquasecurity/trivy
 * Normalises Trivy JSON output (fs or image scan) into SENQOR observations.
 * Focus: cryptographic library packages and their CVEs.
 *
 * EvidenceSource: DEPENDENCY_INFERENCE (package manifest) or
 *                 STATIC_DETECTION    (filesystem scan)
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── Trivy JSON shape (subset) ─────────────────────────────────────────────────

interface TrivyPackage {
  ID?: string;
  Name?: string;
  Version?: string;
  Licenses?: string[];
  Layer?: { DiffID?: string };
}

interface TrivyVulnerability {
  VulnerabilityID?: string;
  PkgName?: string;
  PkgVersion?: string;
  InstalledVersion?: string;
  Severity?: string;       // CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN
  Title?: string;
  Description?: string;
  CVSS?: Record<string, { V3Score?: number }>;
  References?: string[];
}

interface TrivyResult {
  Target?: string;
  Class?: string;  // "os-pkgs" | "lang-pkgs" | "secret" | "license"
  Type?: string;   // "alpine" | "npm" | "gomod" | etc.
  Packages?: TrivyPackage[];
  Vulnerabilities?: TrivyVulnerability[];
}

export interface TrivyOutput {
  SchemaVersion?: number;
  ArtifactName?: string;
  ArtifactType?: string;
  Results?: TrivyResult[];
}

// ── Cryptographic library name patterns ───────────────────────────────────────
// If a package matches any of these it gets an observation even without a CVE.

const CRYPTO_PACKAGES = new Set([
  "openssl", "libssl", "libssl1.0", "libssl1.1", "libssl3",
  "libcrypto", "libcrypto1.0", "libcrypto1.1", "libcrypto3",
  "openssl-libs", "openssl-devel",
  "gnutls", "libgnutls", "libgnutls30",
  "nss", "libnss3", "libnss-myhostname",
  "libgcrypt", "libgcrypt20",
  "bouncycastle", "bcprov", "bcpkix", "bc-fips",
  "cryptography",      // Python
  "pyopenssl",
  "pycryptodome",
  "pycryptodomex",
  "paramiko",
  "golang.org/x/crypto",
  "crypto/tls",        // Go stdlib
  "java.security",
  "javax.crypto",
  "org.bouncycastle",
  "com.nimbusds",
  "spring-security-crypto",
  "node-forge",
  "node:crypto",
  "subtle",            // Web Crypto API
  "liboqs",
  "oqs-provider",
  "oqs-openssl",
  "pqcrypto",
]);

function isCryptoPackage(name: string): boolean {
  const lower = name.toLowerCase();
  for (const cp of CRYPTO_PACKAGES) {
    if (lower.includes(cp)) return true;
  }
  // Also match patterns like "libssl-dev", "openssl-1.1.1"
  return /openssl|libssl|libcrypto|gnutls|bouncy.castle|bouncycastle|liboqs|oqs/.test(lower);
}

// Map package version prefixes to an algorithm guess for common crypto libs
function guessAlgorithmFromPackage(name: string, version: string): string | undefined {
  const n = name.toLowerCase();
  if (/openssl/.test(n)) {
    // openssl 1.x supports TLS 1.2 max with classical crypto
    // openssl 3.x has PQC provider support
    if (version.startsWith("1.0") || version.startsWith("0.")) return "RSA-2048";
    if (version.startsWith("1.1")) return "RSA-2048";
    return undefined; // 3.x — need more info
  }
  return undefined;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const trivyAdapter: SensorAdapter<TrivyOutput> = {
  sensorType: "TRIVY",
  displayName: "Trivy",
  evidenceSource: "DEPENDENCY_INFERENCE",

  validate(raw): raw is TrivyOutput {
    return typeof raw === "object" && raw !== null && "Results" in raw;
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    const artifact = raw.ArtifactName ?? "";

    try {
      for (const result of raw.Results ?? []) {
        const target = result.Target ?? artifact;

        // ── Package observations (crypto libs present in the image/repo) ──
        for (const pkg of result.Packages ?? []) {
          const name = pkg.Name ?? "";
          if (!isCryptoPackage(name)) continue;

          const version = pkg.Version ?? "";
          const guessedAlgo = guessAlgorithmFromPackage(name, version);
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
            context: `Cryptographic package detected in ${result.Type ?? result.Class ?? "unknown"} layer`,
            confidence: computeConfidence("DEPENDENCY_INFERENCE", undefined, 0),
            rawPayload: pkg,
            provider: `${name} ${version}`,
          });
        }

        // ── Vulnerability observations (CVEs in crypto libs) ──
        for (const vuln of result.Vulnerabilities ?? []) {
          const pkgName = vuln.PkgName ?? "";
          if (!isCryptoPackage(pkgName)) continue;

          const severity = vuln.Severity ?? "UNKNOWN";
          const cvssScore = Object.values(vuln.CVSS ?? {}).find(c => c.V3Score != null)?.V3Score;

          // Only surface HIGH/CRITICAL crypto CVEs as observations
          if (!["CRITICAL", "HIGH"].includes(severity)) continue;

          obs.push({
            sensorType: ctx.sensorType,
            evidenceSource: ctx.evidenceSource,
            observedAt: ctx.scannedAt,
            // CVEs in crypto libs don't directly map to algorithms,
            // but we flag as QUANTUM_VULNERABLE since it's a broken classical lib
            algorithm: undefined,
            primitiveType: undefined,
            quantumClass: "QUANTUM_VULNERABLE",
            packageName: pkgName,
            packageVersion: vuln.InstalledVersion ?? vuln.PkgVersion ?? "",
            filePath: target,
            context: `${vuln.VulnerabilityID}: ${vuln.Title ?? vuln.Description?.slice(0, 120) ?? ""}`,
            confidence: computeConfidence("DEPENDENCY_INFERENCE", undefined, cvssScore ? 1 - (cvssScore / 10) : 0.5),
            rawPayload: vuln,
            notes: vuln.VulnerabilityID,
          });
        }
      }
    } catch (e) {
      console.error("[TrivyAdapter] normalize failed:", e);
    }

    return obs;
  },
};
