import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import type { OpenscapOutput, OpenscapRuleResult } from "@/lib/scanners/engines/openscap-engine";
import { computeConfidence } from "../normalizer/confidence-model";

const CRYPTO_KEYWORDS = ["tls", "ssl", "cert", "crypt", "cipher", "key", "pki", "sha", "rsa", "aes", "fips"];

function isCryptoRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return CRYPTO_KEYWORDS.some(k => lower.includes(k));
}

function inferAlgorithm(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("tls") || lower.includes("ssl")) return "TLS";
  if (lower.includes("rsa"))                           return "RSA";
  if (lower.includes("aes"))                           return "AES";
  if (lower.includes("sha-1") || lower.includes("sha1")) return "SHA-1";
  if (lower.includes("cert") || lower.includes("pki"))  return "X509";
  if (lower.includes("fips"))                           return "FIPS";
  if (lower.includes("cipher"))                         return "TLS";
  return "CRYPTO_CONFIG";
}

function severityWeight(severity: OpenscapRuleResult["severity"]): number {
  switch (severity) {
    case "critical": return 90;
    case "high":     return 80;
    case "medium":   return 65;
    case "low":      return 50;
    default:         return 55;
  }
}

export const openscapAdapter: SensorAdapter<OpenscapOutput> = {
  sensorType: "OPENSCAP",
  displayName: "OpenSCAP",
  evidenceSource: "CONFIGURATION",

  validate(raw): raw is OpenscapOutput {
    return typeof raw === "object" && raw !== null &&
      Array.isArray((raw as OpenscapOutput).results);
  },

  normalize(raw: OpenscapOutput, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const result of raw.results) {
        if (result.result !== "fail") continue;
        if (!isCryptoRelevant(result.title)) continue;

        obs.push({
          sensorType:     ctx.sensorType,
          evidenceSource: "CONFIGURATION",
          observedAt:     ctx.scannedAt,
          algorithm:      inferAlgorithm(result.title),
          algorithmRaw:   result.id,
          quantumClass:   "UNKNOWN",
          confidence:     computeConfidence("CONFIGURATION", severityWeight(result.severity), 0),
          context:        result.title,
          rawPayload:     result,
          notes:          `OpenSCAP rule FAIL: ${result.id} [${result.severity}] profile: ${raw.profile}`,
        });
      }
    } catch (e) {
      console.error("[OpenscapAdapter] normalize failed:", e);
    }
    return obs;
  },
};
