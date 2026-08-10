import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import type { CheckovOutput } from "@/lib/scanners/engines/checkov-engine";
import { computeConfidence } from "../normalizer/confidence-model";

function inferAlgorithmFromCheckId(checkId: string, name: string): string | undefined {
  const s = (checkId + " " + name).toLowerCase();
  if (s.includes("tls") || s.includes("ssl"))  return "TLS";
  if (s.includes("rsa"))                        return "RSA";
  if (s.includes("ecdsa") || s.includes("ecc")) return "ECDSA";
  if (s.includes("kms") || s.includes("encrypt")) return "AES";
  if (s.includes("ssh"))                        return "SSH_KEY";
  if (s.includes("cert"))                       return "X509";
  if (s.includes("secret") || s.includes("password")) return "EXPOSED_SECRET";
  return undefined;
}

export const checkovAdapter: SensorAdapter<CheckovOutput> = {
  sensorType: "CHECKOV",
  displayName: "Checkov",
  evidenceSource: "STATIC_DETECTION",

  validate(raw): raw is CheckovOutput {
    return typeof raw === "object" && raw !== null && "results" in (raw as CheckovOutput);
  },

  normalize(raw: CheckovOutput, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      const failed = raw.results?.failed_checks ?? [];
      for (const check of failed) {
        const algo = inferAlgorithmFromCheckId(check.check_id, check.check_name);
        if (!algo) continue;

        obs.push({
          sensorType:     ctx.sensorType,
          evidenceSource: "STATIC_DETECTION",
          observedAt:     ctx.scannedAt,
          algorithm:      algo,
          algorithmRaw:   check.check_id,
          quantumClass:   "UNKNOWN",
          confidence:     computeConfidence("STATIC_DETECTION", 65, 0),
          filePath:       check.file_path || undefined,
          lineNumber:     check.file_line_range?.[0] || undefined,
          context:        check.check_name,
          rawPayload:     check,
          notes:          `Checkov ${check.check_id}: ${check.check_name}`,
        });
      }
    } catch (e) {
      console.error("[CheckovAdapter] normalize failed:", e);
    }
    return obs;
  },
};
