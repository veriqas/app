/**
 * Grype adapter — https://github.com/anchore/grype
 * Normalises Grype JSON vulnerability scan output into SENQOR observations.
 *
 * Grype identifies CVEs in packages. This adapter surfaces:
 * 1. Vulnerabilities in cryptographic libraries (HIGH/CRITICAL)
 * 2. Presence of crypto packages (as DEPENDENCY_INFERENCE observations)
 *
 * EvidenceSource: DEPENDENCY_INFERENCE
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { computeConfidence } from "../normalizer/confidence-model";

// ── Grype JSON shape (subset) ─────────────────────────────────────────────────

interface GrypeCVSS {
  version?: string;
  vector?: string;
  metrics?: {
    baseScore?: number;
    exploitabilityScore?: number;
    impactScore?: number;
  };
  vendorMetadata?: Record<string, unknown>;
}

interface GrypeVulnerability {
  id?: string;
  dataSource?: string;
  namespace?: string;
  severity?: string;  // Critical | High | Medium | Low | Negligible | Unknown
  urls?: string[];
  description?: string;
  cvss?: GrypeCVSS[];
  fix?: {
    versions?: string[];
    state?: string;  // "fixed" | "not-fixed" | "wont-fix" | "unknown"
  };
  advisories?: Array<{ id?: string; link?: string }>;
}

interface GrypeArtifact {
  id?: string;
  name?: string;
  version?: string;
  type?: string;       // "deb" | "rpm" | "npm" | "go-module" | "python" | etc.
  foundBy?: { name?: string };
  locations?: Array<{ path?: string }>;
  language?: string;
  cpes?: string[];
  purl?: string;
}

interface GrypeMatch {
  vulnerability?: GrypeVulnerability;
  relatedVulnerabilities?: GrypeVulnerability[];
  matchDetails?: Array<{ type?: string; matcher?: string }>;
  artifact?: GrypeArtifact;
}

export interface GrypeOutput {
  matches?: GrypeMatch[];
  ignoredMatches?: unknown[];
  source?: { type?: string; target?: unknown };
  distro?: { name?: string; version?: string };
  descriptor?: { name?: string; version?: string };
}

// ── Crypto package detection ──────────────────────────────────────────────────

const CRYPTO_PACKAGE_RE =
  /openssl|libssl|libcrypto|gnutls|libnss|nss3|libgcrypt|bouncy.?castle|bcprov|bcpkix|cryptography|pyopenssl|pycryptodome|paramiko|golang\.org\/x\/crypto|liboqs|oqs-provider|mbedtls|wolfssl|node-forge/i;

// Severity → confidence penalty (higher severity = more confident it matters)
function severityToConfidence(severity: string): number {
  switch (severity.toLowerCase()) {
    case "critical":    return 90;
    case "high":        return 80;
    case "medium":      return 65;
    case "low":         return 50;
    case "negligible":  return 35;
    default:            return 40;
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const grypeAdapter: SensorAdapter<GrypeOutput> = {
  sensorType: "GRYPE",
  displayName: "Grype",
  evidenceSource: "DEPENDENCY_INFERENCE",

  validate(raw): raw is GrypeOutput {
    return typeof raw === "object" && raw !== null && "matches" in raw;
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];

    // Track seen packages to emit one "crypto package present" observation per package
    const seenPackages = new Set<string>();

    try {
      for (const match of raw.matches ?? []) {
        const artifact = match.artifact ?? {};
        const vuln = match.vulnerability ?? {};
        const pkgName = artifact.name ?? "";
        const pkgVersion = artifact.version ?? "";
        const severity = vuln.severity ?? "Unknown";
        const cvssScore = vuln.cvss?.[0]?.metrics?.baseScore;
        const location = artifact.locations?.[0]?.path;
        const isCrypto = CRYPTO_PACKAGE_RE.test(pkgName);

        if (!isCrypto) continue;

        // Emit crypto package presence (once per package)
        const pkgKey = `${pkgName}@${pkgVersion}`;
        if (!seenPackages.has(pkgKey)) {
          seenPackages.add(pkgKey);
          obs.push({
            sensorType: ctx.sensorType,
            evidenceSource: ctx.evidenceSource,
            observedAt: ctx.scannedAt,
            algorithm: undefined,
            primitiveType: undefined,
            quantumClass: "QUANTUM_VULNERABLE",  // classical lib until proven otherwise
            packageName: pkgName,
            packageVersion: pkgVersion,
            filePath: location,
            context: `Cryptographic library identified by Grype vulnerability scan`,
            confidence: computeConfidence("DEPENDENCY_INFERENCE", undefined, 0),
            rawPayload: { name: pkgName, version: pkgVersion, type: artifact.type },
            provider: artifact.purl ?? pkgKey,
          });
        }

        // Only surface HIGH/CRITICAL CVEs as separate observations
        if (!["critical", "high"].includes(severity.toLowerCase())) continue;

        obs.push({
          sensorType: ctx.sensorType,
          evidenceSource: ctx.evidenceSource,
          observedAt: ctx.scannedAt,
          algorithm: undefined,
          primitiveType: undefined,
          quantumClass: "QUANTUM_VULNERABLE",
          packageName: pkgName,
          packageVersion: pkgVersion,
          filePath: location,
          context: `${vuln.id}: [${severity.toUpperCase()}] ${vuln.description?.slice(0, 120) ?? ""}`,
          confidence: severityToConfidence(severity),
          rawPayload: { vulnerability: vuln, artifact },
          notes: [vuln.id, vuln.fix?.state ? `fix: ${vuln.fix.state}` : null].filter(Boolean).join(" · "),
        });
      }
    } catch (e) {
      console.error("[GrypeAdapter] normalize failed:", e);
    }

    return obs;
  },
};
