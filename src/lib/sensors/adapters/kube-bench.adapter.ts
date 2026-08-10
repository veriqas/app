import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import type { KubeBenchOutput } from "@/lib/scanners/engines/kube-bench-engine";
import { computeConfidence } from "../normalizer/confidence-model";

const CRYPTO_KEYWORDS = ["tls", "ssl", "cert", "crypt", "encrypt", "cipher", "key", "pki", "etcd"];

function isCryptoRelevant(desc: string): boolean {
  const lower = desc.toLowerCase();
  return CRYPTO_KEYWORDS.some(k => lower.includes(k));
}

function inferAlgorithm(desc: string): string {
  const lower = desc.toLowerCase();
  if (lower.includes("tls") || lower.includes("ssl")) return "TLS";
  if (lower.includes("cert"))                          return "X509";
  if (lower.includes("etcd"))                          return "TLS";
  if (lower.includes("encrypt"))                       return "AES";
  if (lower.includes("key"))                           return "KEY_MANAGEMENT";
  return "TLS";
}

export const kubeBenchAdapter: SensorAdapter<KubeBenchOutput> = {
  sensorType: "KUBE_BENCH",
  displayName: "kube-bench",
  evidenceSource: "CONFIGURATION",

  validate(raw): raw is KubeBenchOutput {
    return typeof raw === "object" && raw !== null && Array.isArray((raw as KubeBenchOutput).controls);
  },

  normalize(raw: KubeBenchOutput, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const control of raw.controls) {
        for (const test of control.tests) {
          for (const result of test.results) {
            if (result.status !== "FAIL") continue;
            const desc = `${result.test_number} ${result.test_desc}`;
            if (!isCryptoRelevant(desc)) continue;

            obs.push({
              sensorType:     ctx.sensorType,
              evidenceSource: "CONFIGURATION",
              observedAt:     ctx.scannedAt,
              algorithm:      inferAlgorithm(desc),
              algorithmRaw:   result.test_number,
              quantumClass:   "UNKNOWN",
              confidence:     computeConfidence("CONFIGURATION", 75, 0),
              context:        result.test_desc,
              rawPayload:     result,
              notes:          `kube-bench ${result.test_number}: ${result.test_desc}. Reason: ${result.reason}`,
            });
          }
        }
      }
    } catch (e) {
      console.error("[KubeBenchAdapter] normalize failed:", e);
    }
    return obs;
  },
};
