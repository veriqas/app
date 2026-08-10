/**
 * ssh-audit adapter — https://github.com/jtesta/ssh-audit
 * SSH algorithm and configuration discovery.
 * EvidenceSource: ACTIVE_HANDSHAKE
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";
import type { PrimitiveType } from "../types/observation";

// ── ssh-audit JSON output shape ────────────────────────────────────────────────

type AlgorithmSecurity = "safe" | "good" | "warn" | "fail" | "info" | "unknown";

interface SshAuditAlgorithm {
  name?: string;
  security?: AlgorithmSecurity;
  description?: string;
  notes?: string[];
  cves?: string[];
}

interface SshAuditAlgorithmList {
  kex?: SshAuditAlgorithm[];
  key?: SshAuditAlgorithm[];
  enc?: SshAuditAlgorithm[];
  mac?: SshAuditAlgorithm[];
}

export interface SshAuditOutput {
  target?: string;
  port?: number;
  banner?: {
    protocol?: { raw?: string };
    software?: string;
    comments?: string;
  };
  algorithms?: SshAuditAlgorithmList;
  recommendations?: {
    critical?: SshAuditAlgorithmList;
    warning?: SshAuditAlgorithmList;
  };
  fingerprints?: Array<{
    hash_alg?: string;
    hash?: string;
    key_type?: string;
    key_bits?: number;
  }>;
  [key: string]: unknown;
}

// ── Security classification → quantum class ────────────────────────────────────

function securityToQuantum(
  sec?: AlgorithmSecurity,
  name?: string
): import("../types/observation").QuantumClass {
  const n = name?.toLowerCase() ?? "";
  // PQC algorithms will be listed as safe with known PQC names
  if (n.includes("kyber") || n.includes("dilithium") || n.includes("ntru")
    || n.includes("mlkem") || n.includes("mldsa") || n.includes("falcon")
    || n.includes("sphincs")) return "POST_QUANTUM";

  // RSA/ECDSA/ECDH/DH are quantum-vulnerable regardless of ssh-audit rating
  if (n.startsWith("rsa") || n.startsWith("ecdh") || n.startsWith("ecdsa")
    || n.startsWith("diffie-hellman") || n.startsWith("dh-")
    || n.startsWith("curve25519") || n.startsWith("ed25519")
    || n.startsWith("ed448") || n.startsWith("x25519") || n.startsWith("x448")) {
    return "QUANTUM_VULNERABLE";
  }

  if (sec === "fail") return "QUANTUM_VULNERABLE";
  return "UNKNOWN";
}

// ── Algorithm group → primitive type ──────────────────────────────────────────

const groupPrimitive: Record<string, PrimitiveType> = {
  kex: "KEY_ESTABLISHMENT",
  key: "DIGITAL_SIGNATURE",
  enc: "SYMMETRIC_ENCRYPTION",
  mac: "MAC",
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export const sshAuditAdapter: SensorAdapter<SshAuditOutput> = {
  sensorType: "SSH_AUDIT",
  displayName: "ssh-audit",
  evidenceSource: "ACTIVE_HANDSHAKE",

  validate(raw): raw is SshAuditOutput {
    return typeof raw === "object" && raw !== null &&
      ("algorithms" in raw || "target" in raw);
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      const host = raw.target ?? "";
      const port = raw.port ?? 22;
      const endpoint = `${host}:${port}`;
      const protocol = raw.banner?.protocol?.raw ?? "SSH-2.0";
      const provider = raw.banner?.software ?? undefined;

      const algoGroups = raw.algorithms ?? {};

      for (const [group, algoList] of Object.entries(algoGroups) as Array<[string, SshAuditAlgorithm[]]>) {
        const primitiveType = groupPrimitive[group] ?? "OTHER";
        for (const algo of algoList ?? []) {
          if (!algo.name) continue;
          const crypto = normalizeCrypto(algo.name);
          const qc = securityToQuantum(algo.security, algo.name);

          obs.push({
            sensorType: ctx.sensorType,
            evidenceSource: "ACTIVE_HANDSHAKE",
            observedAt: ctx.scannedAt,
            algorithm: crypto.algorithm,
            algorithmRaw: algo.name,
            primitiveType: crypto.primitiveType ?? primitiveType,
            quantumClass: qc !== "UNKNOWN" ? qc : crypto.quantumClass,
            keySize: crypto.keySize,
            curve: crypto.curve,
            protocol,
            provider,
            endpoint,
            port,
            context: `SSH ${group.toUpperCase()} — ${algo.description ?? ""}`.trim(),
            confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
            rawPayload: algo,
            notes: algo.notes?.join("; "),
          });
        }
      }

      // Host key fingerprints → certificate-style observation
      for (const fp of raw.fingerprints ?? []) {
        if (!fp.key_type) continue;
        const crypto = normalizeCrypto(fp.key_type);
        obs.push({
          sensorType: ctx.sensorType,
          evidenceSource: "ACTIVE_HANDSHAKE",
          observedAt: ctx.scannedAt,
          algorithm: crypto.algorithm,
          algorithmRaw: fp.key_type,
          primitiveType: "CERTIFICATE",
          quantumClass: crypto.quantumClass,
          keySize: fp.key_bits ?? crypto.keySize,
          protocol,
          endpoint,
          port,
          context: `SSH host key (${fp.hash_alg ?? "?"}: ${fp.hash ?? ""})`,
          confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
          rawPayload: fp,
        });
      }
    } catch (e) {
      console.error("[SshAuditAdapter] normalize failed:", e);
    }
    return obs;
  },
};
