import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import type { KubeHunterOutput } from "@/lib/scanners/engines/kube-hunter-engine";
import { computeConfidence } from "../normalizer/confidence-model";

const CRYPTO_KEYWORDS = ["tls", "ssl", "cert", "crypt", "encrypt", "cipher", "key", "secret", "token"];

function isCryptoRelevant(s: string): boolean {
  const lower = s.toLowerCase();
  return CRYPTO_KEYWORDS.some(k => lower.includes(k));
}

function inferAlgorithm(vuln: string, category: string): string {
  const s = (vuln + " " + category).toLowerCase();
  if (s.includes("tls") || s.includes("ssl")) return "TLS";
  if (s.includes("cert"))                      return "X509";
  if (s.includes("secret") || s.includes("token")) return "EXPOSED_SECRET";
  if (s.includes("encrypt"))                   return "AES";
  if (s.includes("key"))                        return "KEY_MANAGEMENT";
  return "TLS";
}

function severityConfidence(severity: string): number {
  switch (severity.toLowerCase()) {
    case "high":   return 85;
    case "medium": return 70;
    case "low":    return 55;
    default:       return 60;
  }
}

export const kubeHunterAdapter: SensorAdapter<KubeHunterOutput> = {
  sensorType: "KUBE_HUNTER",
  displayName: "kube-hunter",
  evidenceSource: "ACTIVE_HANDSHAKE",

  validate(raw): raw is KubeHunterOutput {
    return typeof raw === "object" && raw !== null &&
      Array.isArray((raw as KubeHunterOutput).vulnerabilities);
  },

  normalize(raw: KubeHunterOutput, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const vuln of raw.vulnerabilities) {
        if (!isCryptoRelevant(vuln.vulnerability + " " + vuln.category + " " + vuln.description)) continue;

        obs.push({
          sensorType:     ctx.sensorType,
          evidenceSource: "ACTIVE_HANDSHAKE",
          observedAt:     ctx.scannedAt,
          algorithm:      inferAlgorithm(vuln.vulnerability, vuln.category),
          algorithmRaw:   vuln.id,
          quantumClass:   "UNKNOWN",
          confidence:     computeConfidence("ACTIVE_HANDSHAKE", severityConfidence(vuln.severity), 0),
          endpoint:       vuln.location,
          context:        vuln.description,
          rawPayload:     vuln,
          notes:          `kube-hunter ${vuln.id}: ${vuln.vulnerability} [${vuln.severity}]`,
        });
      }
    } catch (e) {
      console.error("[KubeHunterAdapter] normalize failed:", e);
    }
    return obs;
  },
};
