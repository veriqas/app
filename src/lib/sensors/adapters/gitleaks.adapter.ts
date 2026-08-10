import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import type { GitleaksOutput } from "@/lib/scanners/engines/gitleaks-engine";
import { computeConfidence } from "../normalizer/confidence-model";

// Map gitleaks rule IDs to algorithm names
// Gitleaks uses kebab-case rule IDs e.g. rsa-private-key, generic-api-key, github-pat
function inferAlgorithm(ruleId: string, description: string): string {
  const r = (ruleId + " " + description).toLowerCase();
  if (r.includes("rsa"))                                      return "RSA";
  if (r.includes("ecdsa") || r.includes("ec-key"))           return "ECDSA";
  if (r.includes("ed25519"))                                  return "Ed25519";
  if (r.includes("dsa"))                                      return "DSA";
  if (r.includes("pgp") || r.includes("gpg"))                return "PGP";
  if (r.includes("openssh") || (r.includes("ssh") && r.includes("priv"))) return "SSH Private Key";
  if (r.includes("ssh"))                                      return "SSH Key";
  if (r.includes("x509") || r.includes("pkcs"))              return "X.509 Certificate";
  if (r.includes("jwt"))                                      return "JWT";
  if (r.includes("aes"))                                      return "AES";
  if (r.includes("hmac"))                                     return "HMAC";
  if (r.includes("github"))                                   return "GitHub Token";
  if (r.includes("aws"))                                      return "AWS Credential";
  if (r.includes("gcp") || r.includes("google"))             return "GCP Credential";
  if (r.includes("azure"))                                    return "Azure Credential";
  if (r.includes("stripe"))                                   return "Stripe Key";
  if (r.includes("twilio"))                                   return "Twilio Key";
  if (r.includes("sendgrid"))                                 return "SendGrid Key";
  if (r.includes("slack"))                                    return "Slack Token";
  if (r.includes("private-key") || r.includes("private_key")) return "Private Key";
  if (r.includes("api") || r.includes("token"))               return "API Token";
  if (r.includes("secret") || r.includes("password"))        return "Secret";
  return ruleId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Map to a primitive type
function inferPrimitiveType(algo: string): string | undefined {
  const a = algo.toLowerCase();
  if (["rsa", "ecdsa", "ed25519", "dsa"].some(k => a.includes(k))) return "DIGITAL_SIGNATURE";
  if (a.includes("ssh"))       return "KEY_ESTABLISHMENT";
  if (a.includes("pgp") || a.includes("x509") || a.includes("private key") || a.includes("private_key")) return "PUBLIC_KEY_ENCRYPTION";
  if (a.includes("aes"))       return "SYMMETRIC_ENCRYPTION";
  if (a.includes("hmac"))      return "MAC";
  if (a.includes("jwt"))       return "DIGITAL_SIGNATURE";
  return undefined;
}

// Classify quantum risk of an exposed key
function inferQuantumClass(algo: string): string {
  const a = algo.toLowerCase();
  // Classical asymmetric — broken by Shor's algorithm
  if (["rsa", "ecdsa", "dsa", "ed25519", "x509", "private key", "pgp", "ssh"].some(k => a.includes(k))) {
    return "QUANTUM_VULNERABLE";
  }
  // Symmetric / HMAC — weakened by Grover's but not broken
  if (["aes", "hmac"].some(k => a.includes(k))) return "QUANTUM_REDUCED_SECURITY";
  // API tokens, passwords, cloud credentials — not quantum-relevant but still exposed
  return "UNKNOWN";
}

// Key size hints from rule / description text
function inferKeySize(ruleId: string, description: string): number | undefined {
  const text = ruleId + " " + description;
  const m = text.match(/(\d{3,4})[- ]?bit/i);
  if (m) return parseInt(m[1], 10);
  if (/rsa/i.test(text)) return 2048;    // assume common default
  if (/ecdsa/i.test(text)) return 256;
  return undefined;
}

export const gitleaksAdapter: SensorAdapter<GitleaksOutput> = {
  sensorType: "GITLEAKS",
  displayName: "Secret & Key Detector",
  evidenceSource: "STATIC_DETECTION",

  validate(raw): raw is GitleaksOutput {
    return typeof raw === "object" && raw !== null && Array.isArray((raw as GitleaksOutput).findings);
  },

  normalize(raw: GitleaksOutput, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const f of raw.findings) {
        const algo         = inferAlgorithm(f.RuleID, f.Description ?? "");
        const primitive    = inferPrimitiveType(algo);
        const quantumClass = inferQuantumClass(algo);
        const keySize      = inferKeySize(f.RuleID, f.Description ?? "");

        obs.push({
          sensorType:     ctx.sensorType,
          evidenceSource: "STATIC_DETECTION",
          observedAt:     new Date(f.Date || ctx.scannedAt),
          algorithm:      algo,
          algorithmRaw:   f.RuleID,
          primitiveType:  primitive,
          quantumClass,
          keySize,
          confidence:     computeConfidence("STATIC_DETECTION", 75, 0),
          filePath:       f.File || undefined,
          lineNumber:     f.StartLine || undefined,
          context:        f.Description || f.RuleID,
          rawPayload: {
            ruleId:  f.RuleID,
            file:    f.File,
            line:    f.StartLine,
            commit:  f.Commit,
            author:  f.Author,
            date:    f.Date,
            tags:    f.Tags,
            matchPreview: f.Match ? f.Match.substring(0, 20) + "…" : undefined,
          },
          notes: `Exposed ${algo} secret detected by gitleaks (rule: ${f.RuleID})${f.Commit ? ` in commit ${f.Commit.substring(0, 8)}` : ""}.`,
        });
      }
    } catch (e) {
      console.error("[GitleaksAdapter] normalize failed:", e);
    }
    return obs;
  },
};
